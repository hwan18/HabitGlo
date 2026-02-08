#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, WindowEvent,
};

fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Show HabitGlo"))
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let system_tray = SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("HabitGlo");

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } | SystemTrayEvent::DoubleClick { .. } => {
                if let Some(win) = app.get_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(win) = app.get_window("main") {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                let label = event.window().label();
                if label == "main" {
                    // Hide the main window instead of closing the app
                    event.window().hide().unwrap_or_default();
                    api.prevent_close();
                }
            }
        })
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
