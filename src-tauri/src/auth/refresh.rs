//! トークンリフレッシュ処理

use log::info;
use oauth2::basic::BasicClient;
use oauth2::reqwest;
use oauth2::{ClientId, ClientSecret, RefreshToken, TokenResponse, TokenUrl};
use std::error::Error;
use std::time::Duration;
use tokio::time::timeout;

use super::keyring::{
    current_timestamp, load_auth_from_keychain, save_auth_to_keychain, StoredAuth,
};
use super::TIMEOUT_SECS;

const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

/// リフレッシュトークンを使用してアクセストークンを更新
pub async fn refresh_access_token() -> Result<String, Box<dyn Error + Send + Sync>> {
    // キーチェーンから認証情報を読み込み
    let stored_auth = load_auth_from_keychain()?.ok_or("保存された認証情報が見つかりません")?;
    let refresh_token = RefreshToken::new(stored_auth.refresh_token);

    // 環境変数から認証情報を取得
    let google_client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| "GOOGLE_CLIENT_ID environment variable is not set")?;
    let google_client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "GOOGLE_CLIENT_SECRET environment variable is not set")?;

    let client = BasicClient::new(ClientId::new(google_client_id))
        .set_client_secret(ClientSecret::new(google_client_secret))
        .set_token_uri(TokenUrl::new(GOOGLE_TOKEN_URL.to_string())?);

    // HTTPクライアントを作成
    let http_client = reqwest::ClientBuilder::new()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .expect("HTTPクライアントの作成に失敗");

    // リフレッシュトークンを使ってアクセストークンを更新
    let token_result = timeout(
        Duration::from_secs(TIMEOUT_SECS),
        client
            .exchange_refresh_token(&refresh_token)
            .request_async(&http_client),
    )
    .await
    .map_err(|_| "トークン更新がタイムアウトしました")??;

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
