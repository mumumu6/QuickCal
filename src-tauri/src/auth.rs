use axum::{extract::Query, response::Html, routing::get, Router};
use oauth2::basic::BasicClient;
use oauth2::reqwest;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl,
    Scope, TokenResponse, TokenUrl,
};
use std::error::Error;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

/// 認証結果を格納する構造体
#[derive(serde::Serialize)]
pub struct AuthResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
}

/// コールバックのクエリパラメータ
#[derive(serde::Deserialize)]
struct CallbackParams {
    code: String,
    state: String,
}

#[tauri::command]
pub async fn start_google_auth() -> Result<AuthResult, String> {
    start_google_auth_internal()
        .await
        .map_err(|e| e.to_string())
}

async fn start_google_auth_internal() -> Result<AuthResult, Box<dyn Error + Send + Sync>> {
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

    // 認可URLを生成
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new(GOOGLE_SCOPE.to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    println!("認可URL: {}", auth_url);

    // ブラウザで認可URLを開く
    open::that(auth_url.to_string())?;

    // コールバックを待機して認可コードを取得
    let (code, state) = wait_for_callback(listener).await?;

    // CSRF検証
    if state != *csrf_token.secret() {
        return Err("CSRF検証に失敗しました: stateパラメータが一致しません".into());
    }

    println!("認可コードを取得しました");

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

    println!("アクセストークンを取得しました");

    Ok(AuthResult {
        access_token: token_result.access_token().secret().to_string(),
        refresh_token: token_result.refresh_token().map(|t| t.secret().to_string()),
        expires_in: token_result.expires_in().map(|d| d.as_secs()),
    })
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
                eprintln!("認可コード送信中にエラーが発生しました: {:?}", e);
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

    // サーバーを別タスクで実行
    tokio::spawn(async move {
        if let Err(e) = server.await {
            eprintln!("サーバー起動中にエラーが発生しました: {}", e);
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
