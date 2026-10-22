#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, WindowEvent,
};

fn main() {
    // The LED item starts as "Show LED" (the strip window starts hidden); it follows the real state after that.
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new(commands::TRAY_OPEN, "Open HabitGlo"))
        .add_item(CustomMenuItem::new(commands::TRAY_TOGGLE_LED, "Show LED"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new(commands::TRAY_QUIT, "Quit"));

    let system_tray = SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("HabitGlo");

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } | SystemTrayEvent::DoubleClick { .. } => {
                commands::show_main_window(app);
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                commands::TRAY_OPEN => commands::show_main_window(app),
                commands::TRAY_TOGGLE_LED => {
                    let _ = commands::toggle_overlay_visibility(app);
                }
                commands::TRAY_QUIT => {
                    commands::release_overlay_space(app);
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                let window = event.window();
                match window.label() {
                    "main" => {
                        // Hide the main window instead of closing the app
                        api.prevent_close();
                        commands::hide_main_window(window);
                    }
                    "overlay" => {
                        // Alt+F4 on the LED strip hides it (and frees reserved space) instead of destroying it
                        api.prevent_close();
                        let _ = commands::set_overlay_visibility(&window.app_handle(), false);
                    }
                    _ => {}
                }
            }
        })
        .manage(commands::SnapState::default())
        .invoke_handler(tauri::generate_handler![
            commands::dock_overlay,
            commands::set_overlay_visible
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
