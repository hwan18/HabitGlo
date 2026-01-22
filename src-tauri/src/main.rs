#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .manage(commands::SnapState::default())
        .invoke_handler(tauri::generate_handler![
            commands::set_click_through,
            commands::set_always_on_top,
            commands::snap_to_top,
            commands::snap_to_bottom,
            commands::set_reserve_space,
            commands::set_overlay_size
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
