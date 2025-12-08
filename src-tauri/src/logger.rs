use env_logger::fmt::style::AnsiColor;
use anstyle::Color;
use env_logger::Env;
use log::debug;
use std::io::Write;

pub fn setup_logger() {
    // ログの初期化（デバッグビルドはdebug、リリースビルドはinfo）
    #[cfg(debug_assertions)]
    env_logger::Builder::from_env(Env::default().default_filter_or("debug"))
        .format(|buf, record| {
            let style = buf.default_level_style(record.level());
            let white_style = style.fg_color(Some(Color::Ansi(AnsiColor::White)));

            // ファイル名、行数も出力
            let file = record.file().unwrap_or("?");
            let line = record.line().unwrap_or(0);
            writeln!(
                buf,
                "{} [{}] {} [{}:{}] {}",
                style,
                record.level(),
                white_style, // 白文字にする
                file,
                line, // 行数を追加
                record.args()
            )
        })
        .init();
    debug!("デバッグビルド");

    // ビルドはログを出力しない
    #[cfg(not(debug_assertions))]
    env_logger::Builder::from_env(Env::default().default_filter_or("off")).init();
}
