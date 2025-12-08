mod auth;
mod shortcut;
mod logger;
use dotenvy::dotenv;
use log::error;
use std::env;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // .envファイルを読み込み
    dotenv().ok();


    tauri::Builder::default()
        .setup(|app| {
            // ログの初期化
            logger::setup_logger();

            // グローバルショートカットを設定
            if let Err(e) = shortcut::setup_global_shortcut(&app.handle()) {
                error!("Failed to setup global shortcut: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![auth::get_access_token,])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
