use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Window};
#[cfg(windows)]
use winapi::um::winuser::{SystemParametersInfoW, SPI_GETWORKAREA, RECT};

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
pub fn snap_to_top(app: AppHandle) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
    if let Some(monitor) = overlay_window.current_monitor().map_err(|e| e.to_string())? {
        let size = monitor.size();
        let overlay_height = 120.0;
        overlay_window
            .set_position(PhysicalPosition { x: 0, y: 0 })
            .map_err(|e| e.to_string())?;
        overlay_window
            .set_size(PhysicalSize {
                width: size.width,
                height: overlay_height,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn snap_to_bottom(app: AppHandle) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
    if let Some(monitor) = overlay_window.current_monitor().map_err(|e| e.to_string())? {
        let size = monitor.size();
        let overlay_height = 120.0;
        // Get taskbar height by checking available screen area
        // On Windows, we can use SystemParametersInfo or calculate from monitor
        // For now, estimate taskbar as ~40px (typical) or use a safe margin
        let taskbar_height = 40.0; // Typical Windows taskbar height
        let bottom_y = (size.height as f64 - overlay_height - taskbar_height) as i32;
        overlay_window
            .set_position(PhysicalPosition {
                x: 0,
                y: bottom_y.max(0),
            })
            .map_err(|e| e.to_string())?;
        overlay_window
            .set_size(PhysicalSize {
                width: size.width,
                height: overlay_height,
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
