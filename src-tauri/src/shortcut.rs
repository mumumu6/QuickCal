use log::{error, info};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

pub fn setup_global_shortcut(handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let alt_c = Shortcut::try_from("Alt+C")?;

    handle.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts([alt_c])?
            .with_handler(move |app_handle, _shortcut, event| {
                // キーアップ時は無視
                if event.state() == ShortcutState::Released {
                    return;
                }

                // ショートカット処理
                if let Err(e) = run_shortcut_process(app_handle) {
                    error!("Failed to run shortcut process: {}", e);
                }
            })
            .build(),
    )?;

    info!("Shortcut registered successfully: Alt+C");
    Ok(())
}

fn run_shortcut_process(handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = handle.get_webview_window("main") {
        // ウィンドウの表示状態を確認
        if let Ok(is_visible) = window.is_visible() {
            if is_visible {
                // 表示中なら非表示にする
                window.hide()?;
            } else {
                // 非表示なら表示する
                window.show()?;
                window.unminimize()?;
                window.set_focus()?;
            }
        }

        // クリップボードイベント、jsへ
        window.emit("shortcut-triggered", ())?;

        Ok(())
    } else {
        Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Window not found!",
        )))
    }
}
