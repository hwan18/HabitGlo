use tauri::{PhysicalPosition, PhysicalSize, Window};

#[tauri::command]
pub fn set_click_through(window: Window, enabled: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_always_on_top(window: Window, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snap_to_top(window: Window) -> Result<(), String> {
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let size = monitor.size();
        window
            .set_position(PhysicalPosition { x: 0, y: 0 })
            .map_err(|e| e.to_string())?;
        window
            .set_size(PhysicalSize {
                width: size.width,
                height: 120,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_overlay_size(window: Window, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(PhysicalSize { width, height })
        .map_err(|e| e.to_string())
}
