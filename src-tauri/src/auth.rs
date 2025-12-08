mod keyring;
mod oauth;
mod refresh;

use log::{debug, info, warn};
use std::error::Error;

use keyring::{current_timestamp, delete_auth_from_keychain, load_auth_from_keychain};

/// タイムアウト時間（秒）- HTTP通信、コールバック待機に使用
const TIMEOUT_SECS: u64 = 300;

/// 期限切れ前にリフレッシュするための余裕時間
const TOKEN_EXPIRY_MARGIN_SECS: u64 = 300;
use oauth::{cancel_auth as oauth_cancel_auth, start_google_auth};
use refresh::refresh_access_token;

/// アクセストークンを取得（自動的に保存済み認証チェック・リフレッシュ・再認証を判断）
#[tauri::command]
pub async fn get_access_token() -> Result<String, String> {
    debug!("get_access_token 開始");
    get_access_token_internal().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_auth() -> Result<(), String> {
    debug!("cancel_auth 開始");
    cancel_auth_internal().await.map_err(|e| e.to_string())
}

async fn get_access_token_internal() -> Result<String, Box<dyn Error + Send + Sync>> {
    // 保存された認証情報をチェック
    match check_saved_auth().await? {
        Some(token) => {
            // 保存されたトークンを使用
            Ok(token)
        }
        None => {
            // 保存されたトークンがないので新規認証を開始
            start_google_auth().await
        }
    }
}

/// access_tokenが有効期限内かチェックし、有効期限内の場合はaccess_tokenを返す
async fn check_saved_auth() -> Result<Option<String>, Box<dyn Error + Send + Sync>> {
    // キーチェーンから認証情報を読み込み
    let stored_auth = match load_auth_from_keychain()? {
        Some(auth) => auth,
        None => return Ok(None),
    };

    let now = current_timestamp();

    // トークンが有効期限内かチェック（マージンを持たせる）
    if stored_auth.expires_at > now + TOKEN_EXPIRY_MARGIN_SECS {
        info!("保存されたアクセストークンが有効です");
        return Ok(Some(stored_auth.access_token));
    }

    // 有効期限外の場合はリフレッシュを試みる
    info!("アクセストークンの期限が切れています。リフレッシュを試みます...");
    match refresh_access_token().await {
        Ok(new_token) => Ok(Some(new_token)),
        Err(e) => {
            warn!("トークンのリフレッシュに失敗しました: {}", e);
            // リフレッシュに失敗した場合は保存された情報を削除
            delete_auth_from_keychain().ok();
            Ok(None)
        }
    }
}

async fn cancel_auth_internal() -> Result<(), Box<dyn Error + Send + Sync>> {
    oauth_cancel_auth()
}
