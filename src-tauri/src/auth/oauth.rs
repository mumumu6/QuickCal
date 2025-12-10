//! OAuth認証フロー（Google OAuth、コールバック処理）

use axum::{extract::Query, response::Html, routing::get, Router};
use log::{debug, error, info, warn};
use oauth2::basic::BasicClient;
use oauth2::reqwest;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl,
    Scope, TokenResponse, TokenUrl,
};
use std::error::Error;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;

use super::keyring::{current_timestamp, save_auth_to_keychain, StoredAuth};
use super::TIMEOUT_SECS;

/// グローバルキャンセルトークン
static CANCEL_TOKEN: OnceLock<Mutex<Option<CancellationToken>>> = OnceLock::new();

fn get_cancel_token_store() -> &'static Mutex<Option<CancellationToken>> {
    CANCEL_TOKEN.get_or_init(|| Mutex::new(None))
}

/// 認証をキャンセル
pub fn cancel_auth() -> Result<(), Box<dyn Error + Send + Sync>> {
    let store = get_cancel_token_store();
    let guard = store.lock().unwrap();
    if let Some(token) = guard.as_ref() {
        info!("認証キャンセルをリクエストしました");
        token.cancel();
        Ok(())
    } else {
        warn!("キャンセル可能な認証プロセスがありません");
        Err("認証プロセスが実行されていません".into())
    }
}

/// コールバックのクエリパラメータ
#[derive(serde::Deserialize)]
struct CallbackParams {
    code: String,
    state: String,
}

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CLIENT_ID: &str = "339820786895-air2q93cpm104tpmfvhbe2iunkjf4gb9.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET: &str = "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";

/// Google OAuth認証を開始し、アクセストークンを取得
pub async fn start_google_auth() -> Result<String, Box<dyn Error + Send + Sync>> {
    // キャンセルトークンを作成
    let cancel_token = CancellationToken::new();
    {
        let store = get_cancel_token_store();
        let mut guard = store.lock().unwrap();
        *guard = Some(cancel_token.clone());
    }

    // 認証完了時にキャンセルトークンをクリア（成功・失敗・キャンセルいずれの場合も）
    let _cleanup = scopeguard::guard((), |_| {
        let store = get_cancel_token_store();
        let mut guard = store.lock().unwrap();
        *guard = None;
    });

    // 空きポートを動的に取得
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    let client = BasicClient::new(ClientId::new(GOOGLE_CLIENT_ID.to_string()))
        .set_client_secret(ClientSecret::new(GOOGLE_CLIENT_SECRET.to_string()))
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
    let (code, state) = wait_for_callback(listener, cancel_token).await?;

    // CSRF検証
    if state != *csrf_token.secret() {
        return Err("CSRF検証に失敗しました: stateパラメータが一致しません".into());
    }

    info!("認可コードを取得しました");

    // HTTPクライアントを作成（SSRFのためにリダイレクトを無効化）
    let http_client = reqwest::ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .expect("HTTPクライアントの作成に失敗");

    // 認可コードをアクセストークンに交換
    let token_result = timeout(
        Duration::from_secs(TIMEOUT_SECS),
        client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(pkce_verifier)
            .request_async(&http_client),
    )
    .await
    .map_err(|_| "トークン取得がタイムアウトしました")??;

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

/// axumでコールバックを待機し、認可コードとstateを取得する
async fn wait_for_callback(
    listener: TcpListener,
    cancel_token: CancellationToken,
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
        Html(include_str!("../../assets/auth.html"))
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

    // 認可コードを待つ（タイムアウト or キャンセル）
    let result = tokio::select! {
        result = timeout(Duration::from_secs(TIMEOUT_SECS), rx) => {
            match result {
                Ok(Ok((code, state))) => Ok((code, state)),
                Ok(Err(_)) => Err("認可コードの受信に失敗しました".into()),
                Err(_) => Err("認証コールバックがタイムアウトしました".into()),
            }
        }
        _ = cancel_token.cancelled() => {
            info!("認証がユーザーによりキャンセルされました");
            Err("認証がキャンセルされました".into())
        }
    };

    // サーバーを停止
    let _ = shutdown_tx.send(());

    // 少し待ってサーバーが完全に停止するのを待つ
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    result
}
