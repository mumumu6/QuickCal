mod auth;
mod shortcut;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // グローバルショートカットを設定
            if let Err(e) = shortcut::setup_global_shortcut(&app.handle()) {
                eprintln!("Failed to setup global shortcut: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![auth::start_google_auth,])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
