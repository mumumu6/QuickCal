//! キーチェーン（キーリング）関連の処理

use keyring::Entry;
use log::{debug, error};
use serde::{Deserialize, Serialize};
use serde_json::{from_str, to_string};
use std::error::Error;
use std::time::{SystemTime, UNIX_EPOCH};

const KEYCHAIN_SERVICE: &str = "QuickCal";
const KEYCHAIN_USER: &str = "google_auth";

/// キーチェーンに保存する認証情報
#[derive(Serialize, Deserialize)]
pub struct StoredAuth {
    pub refresh_token: String,
    pub access_token: String,
    pub expires_at: u64, // UNIXタイムスタンプ
}

/// キーチェーンに認証情報を保存
pub fn save_auth_to_keychain(stored_auth: &StoredAuth) -> Result<(), Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)?;
    let json = to_string(stored_auth)?;
    entry.set_password(&json)?;
    Ok(())
}

/// キーチェーンから認証情報を読み込み
pub fn load_auth_from_keychain() -> Result<Option<StoredAuth>, Box<dyn Error + Send + Sync>> {
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

/// キーチェーンから認証情報を削除
pub fn delete_auth_from_keychain() -> Result<(), Box<dyn Error + Send + Sync>> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)?;
    entry.delete_credential().ok(); // 存在しない場合のエラーは無視
    Ok(())
}

/// 現在のUNIXタイムスタンプを取得
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}
