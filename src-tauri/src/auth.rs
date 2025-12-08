use axum::{extract::Query, response::Html, routing::get, Router};
use keyring::Entry;
use log::{debug, error, info, warn};
use oauth2::basic::BasicClient;
use oauth2::reqwest;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl,
    RefreshToken, Scope, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use serde_json::{from_str, to_string};
use std::error::Error;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

/// キーチェーンに保存する認証情報
#[derive(Serialize, Deserialize)]
struct StoredAuth {
    refresh_token: String,
    access_token: String,
    expires_at: u64, // UNIXタイムスタンプ
}

/// コールバックのクエリパラメータ
#[derive(serde::Deserialize)]
struct CallbackParams {
    code: String,
    state: String,
}

const KEYCHAIN_SERVICE: &str = "QuickCal";
const KEYCHAIN_USER: &str = "google_auth";

/// キーチェーンに認証情報を保存
fn save_auth_to_keychain(stored_auth: &StoredAuth) -> Result<(), Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)?;
    let json = to_string(stored_auth)?;
    entry.set_password(&json)?;
    Ok(())
}

/// キーチェーンから認証情報を読み込み
fn load_auth_from_keychain() -> Result<Option<StoredAuth>, Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)?;
    match entry.get_password() {
        Ok(json) => {
            let stored_auth: StoredAuth = from_str(&json)?;
            debug!("認証情報を読み込みました");
            Ok(Some(stored_auth))
        }
        Err(keyring::Error::NoEntry) => {
            debug!("認証情報が見つかりません");
            Ok(None)
        }
        Err(e) => {
            error!("認証情報の読み込みに失敗しました: {}", e);
            Err(Box::new(e))
        }
    }
}

/// キーチェーンから認証情報を 削除
fn delete_auth_from_keychain() -> Result<(), Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)?;
    entry.delete_credential().ok(); // 存在しない場合のエラーは無視
    Ok(())
}

/// 現在のUNIXタイムスタンプを取得
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// アクセストークンを取得（自動的に保存済み認証チェック・リフレッシュ・再認証を判断）
#[tauri::command]
pub async fn get_access_token() -> Result<String, String> {
    debug!("get_access_token 開始");
    get_access_token_internal().await.map_err(|e| e.to_string())
}

async fn get_access_token_internal() -> Result<String, Box<dyn Error + Send + Sync>> {
    // 保存された認証情報をチェック
    match check_saved_auth_internal().await? {
        Some(token) => {
            // 保存されたトークンを使用
            Ok(token)
        }
        None => {
            // 保存されたトークンがないので新規認証を開始
            start_google_auth_internal().await
        }
    }
}

async fn start_google_auth_internal() -> Result<String, Box<dyn Error + Send + Sync>> {
    // 環境変数から認証情報を取得
    let google_client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| "GOOGLE_CLIENT_ID environment variable is not set")?;
    let google_client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "GOOGLE_CLIENT_SECRET environment variable is not set")?;

    const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
    const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
    const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/calendar.calendarlist";

    // 空きポートを動的に取得
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    let client = BasicClient::new(ClientId::new(google_client_id))
        .set_client_secret(ClientSecret::new(google_client_secret))
        .set_auth_uri(AuthUrl::new(GOOGLE_AUTH_URL.to_string())?)
        .set_token_uri(TokenUrl::new(GOOGLE_TOKEN_URL.to_string())?)
        .set_redirect_uri(RedirectUrl::new(redirect_uri)?);

    // PKCE challengeの生成
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // 認可URLを生成（access_type=offlineでリフレッシュトークンを取得）
    // ネイティブなのでアクセストークンは常に返ってくる
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new(GOOGLE_SCOPE.to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    debug!("認可URL: {}", auth_url);

    // ブラウザで認可URLを開く
    info!("ブラウザで認証画面を開きます");
    open::that(auth_url.to_string())?;

    // コールバックを待機して認可コードを取得
    let (code, state) = wait_for_callback(listener).await?;

    // CSRF検証
    if state != *csrf_token.secret() {
        return Err("CSRF検証に失敗しました: stateパラメータが一致しません".into());
    }

    info!("認可コードを取得しました");

    // HTTPクライアントを作成（SSRFのためにリダイレクトを無効化）
    let http_client = reqwest::ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("HTTPクライアントの作成に失敗");

    // 認可コードをアクセストークンに交換
    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(pkce_verifier)
        .request_async(&http_client)
        .await?;

    info!("アクセストークンを取得しました");

    // リフレッシュトークンとアクセストークンをキーチェーンに保存
    let access_token = token_result.access_token().secret().to_string();
    let refresh_token = token_result
        .refresh_token()
        .ok_or("リフレッシュトークンが取得できませんでした")?
        .secret()
        .to_string();

    let expires_in = token_result
        .expires_in()
        .map(|d| d.as_secs())
        .unwrap_or(3600);

    let expires_at = current_timestamp() + expires_in;

    let stored_auth = StoredAuth {
        refresh_token,
        access_token: access_token.clone(),
        expires_at,
    };

    save_auth_to_keychain(&stored_auth)?;
    info!("認証情報をキーチェーンに保存しました");

    Ok(access_token)
}

async fn refresh_access_token_internal() -> Result<String, Box<dyn Error + Send + Sync>> {
    // キーチェーンから認証情報を読み込み
    let stored_auth = load_auth_from_keychain()?.ok_or("保存された認証情報が見つかりません")?;
    let refresh_token = RefreshToken::new(stored_auth.refresh_token);

    // 環境変数から認証情報を取得
    let google_client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| "GOOGLE_CLIENT_ID environment variable is not set")?;
    let google_client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "GOOGLE_CLIENT_SECRET environment variable is not set")?;

    const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

    let client = BasicClient::new(ClientId::new(google_client_id))
        .set_client_secret(ClientSecret::new(google_client_secret))
        .set_token_uri(TokenUrl::new(GOOGLE_TOKEN_URL.to_string())?);

    // HTTPクライアントを作成
    let http_client = reqwest::ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("HTTPクライアントの作成に失敗");

    // リフレッシュトークンを使ってアクセストークンを更新
    let token_result = client
        .exchange_refresh_token(&refresh_token)
        .request_async(&http_client)
        .await?;

    let new_access_token = token_result.access_token().secret().to_string();
    let expires_in = token_result
        .expires_in()
        .map(|d| d.as_secs())
        .unwrap_or(3600);
    let expires_at = current_timestamp() + expires_in;

    // 新しいアクセストークンを保存
    let updated_auth = StoredAuth {
        refresh_token: refresh_token.secret().to_string(),
        access_token: new_access_token.clone(),
        expires_at,
    };

    save_auth_to_keychain(&updated_auth)?;
    info!("アクセストークンを更新しました");

    Ok(new_access_token)
}

/// access_tokenが有効期限内かチェックし、有効期限内の場合はaccess_tokenを返す
async fn check_saved_auth_internal() -> Result<Option<String>, Box<dyn Error + Send + Sync>> {
    // キーチェーンから認証情報を読み込み
    let stored_auth = match load_auth_from_keychain()? {
        Some(auth) => auth,
        None => return Ok(None),
    };

    let now = current_timestamp();

    // トークンが有効期限内かチェック（5分のマージンを持たせる）
    if stored_auth.expires_at > now + 300 {
        info!("保存されたアクセストークンが有効です");
        return Ok(Some(stored_auth.access_token));
    }

    // 有効期限外の場合はリフレッシュを試みる
    info!("アクセストークンの期限が切れています。リフレッシュを試みます...");
    match refresh_access_token_internal().await {
        Ok(new_token) => Ok(Some(new_token)),
        Err(e) => {
            warn!("トークンのリフレッシュに失敗しました: {}", e);
            // リフレッシュに失敗した場合は保存された情報を削除
            delete_auth_from_keychain().ok();
            Ok(None)
        }
    }
}

/// axumでコールバックを待機し、認可コードとstateを取得する
async fn wait_for_callback(
    listener: TcpListener,
) -> Result<(String, String), Box<dyn Error + Send + Sync>> {
    // oneshot channelで認可コードを受け取る
    let (tx, rx) = oneshot::channel::<(String, String)>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    // shutdown用のチャンネル
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    // コールバックハンドラ
    let callback_handler = move |Query(params): Query<CallbackParams>| async move {
        if let Some(tx) = tx.lock().unwrap().take() {
            if let Err(e) = tx.send((params.code, params.state)) {
                error!("認可コード送信中にエラーが発生しました: {:?}", e);
            }
        }
        Html(include_str!("../assets/auth.html"))
    };

    // axum Router
    let app = Router::new().route("/callback", get(callback_handler));

    // サーバーを起動（graceful shutdown付き）
    let server = axum::serve(listener, app).with_graceful_shutdown(async {
        shutdown_rx.await.ok();
    });

    // サーバーを別スレッドで実行
    tokio::spawn(async move {
        if let Err(e) = server.await {
            error!("サーバー起動中にエラーが発生しました: {}", e);
        }
    });

    // 認可コードを待つ
    let (code, state) = rx.await?;

    // サーバーを停止
    let _ = shutdown_tx.send(());

    // 少し待ってサーバーが完全に停止するのを待つ
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    Ok((code, state))
}
