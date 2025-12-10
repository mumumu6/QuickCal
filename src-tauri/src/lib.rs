mod auth;
mod logger;
mod shortcut;
use dotenvy::dotenv;
use log::error;
use std::env;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()
        // クリップボードプラグイン
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // ログの初期化
            logger::setup_logger();

            // グローバルショートカットを設定
            if let Err(e) = shortcut::setup_global_shortcut(&app.handle()) {
                error!("Failed to setup global shortcut: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::get_access_token,
            auth::cancel_auth,
            auth::check_saved_auth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
