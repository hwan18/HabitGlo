use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, Window};
#[cfg(windows)]
use winapi::shared::windef::RECT;
#[cfg(windows)]
use winapi::um::winuser::{SystemParametersInfoW, SPI_GETWORKAREA};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SnapEdge {
    Top,
    Bottom,
}

#[derive(Default)]
pub struct SnapState {
    // Where the overlay was before we snapped it.
    pub last_free_pos: Mutex<Option<PhysicalPosition<i32>>>,
    // Which snap is currently active (if any).
    pub snapped: Mutex<Option<SnapEdge>>,
}

#[cfg(windows)]
fn get_primary_work_area() -> Option<RECT> {
    // Returns the Windows "work area" (screen area excluding the taskbar) for the primary monitor.
    // Note: SPI_GETWORKAREA is primary-monitor scoped.
    unsafe {
        let mut rect: RECT = std::mem::zeroed();
        let ok = SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            &mut rect as *mut RECT as *mut _,
            0,
        );
        if ok != 0 {
            Some(rect)
        } else {
            None
        }
    }
}

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
pub fn snap_to_top(app: AppHandle, snap_state: State<SnapState>) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;

    // Toggle off if already snapped to top.
    {
        let mut snapped = snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
        if *snapped == Some(SnapEdge::Top) {
            if let Some(pos) = *snap_state
                .last_free_pos
                .lock()
                .map_err(|_| "snap state poisoned")?
            {
                overlay_window.set_position(pos).map_err(|e| e.to_string())?;
            }
            *snapped = None;
            return Ok(());
        }
    }

    // Save current position only if we're not already snapped.
    {
        let mut snapped = snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
        if snapped.is_none() {
            if let Ok(p) = overlay_window.outer_position() {
                *snap_state
                    .last_free_pos
                    .lock()
                    .map_err(|_| "snap state poisoned")? = Some(PhysicalPosition { x: p.x, y: p.y });
            }
        }
        *snapped = Some(SnapEdge::Top);
    }

    // Preserve current overlay size; only snap position.
    let win_size = overlay_window.outer_size().map_err(|e| e.to_string())?;
    let win_pos = overlay_window
        .outer_position()
        .map(|p| PhysicalPosition { x: p.x, y: p.y })
        .unwrap_or(PhysicalPosition { x: 0, y: 0 });

    #[cfg(windows)]
    if let Some(work) = get_primary_work_area() {
        let min_x = work.left;
        let max_x = work.right - (win_size.width as i32);
        let x = win_pos.x.clamp(min_x, max_x.max(min_x));
        overlay_window
            .set_position(PhysicalPosition { x, y: work.top })
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    if let Some(monitor) = overlay_window.current_monitor().map_err(|e| e.to_string())? {
        let size = monitor.size();
        let max_x = (size.width as i32) - (win_size.width as i32);
        let x = win_pos.x.clamp(0, max_x.max(0));
        overlay_window
            .set_position(PhysicalPosition { x, y: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn snap_to_bottom(app: AppHandle, snap_state: State<SnapState>) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
    // Toggle off if already snapped to bottom.
    {
        let mut snapped = snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
        if *snapped == Some(SnapEdge::Bottom) {
            if let Some(pos) = *snap_state
                .last_free_pos
                .lock()
                .map_err(|_| "snap state poisoned")?
            {
                overlay_window.set_position(pos).map_err(|e| e.to_string())?;
            }
            *snapped = None;
            return Ok(());
        }
    }

    // Save current position only if we're not already snapped.
    {
        let mut snapped = snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
        if snapped.is_none() {
            if let Ok(p) = overlay_window.outer_position() {
                *snap_state
                    .last_free_pos
                    .lock()
                    .map_err(|_| "snap state poisoned")? = Some(PhysicalPosition { x: p.x, y: p.y });
            }
        }
        *snapped = Some(SnapEdge::Bottom);
    }

    // Preserve current overlay size; only snap position.
    let win_size = overlay_window.outer_size().map_err(|e| e.to_string())?;
    let win_pos = overlay_window
        .outer_position()
        .map(|p| PhysicalPosition { x: p.x, y: p.y })
        .unwrap_or(PhysicalPosition { x: 0, y: 0 });

    #[cfg(windows)]
    if let Some(work) = get_primary_work_area() {
        let min_x = work.left;
        let max_x = work.right - (win_size.width as i32);
        let x = win_pos.x.clamp(min_x, max_x.max(min_x));

        let y = work.bottom - (win_size.height as i32);
        let y = y.max(work.top);

        overlay_window
            .set_position(PhysicalPosition { x, y })
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    if let Some(monitor) = overlay_window.current_monitor().map_err(|e| e.to_string())? {
        let size = monitor.size();
        let max_x = (size.width as i32) - (win_size.width as i32);
        let x = win_pos.x.clamp(0, max_x.max(0));

        let y = (size.height as i32) - (win_size.height as i32);
        let y = y.max(0);

        overlay_window
            .set_position(PhysicalPosition { x, y })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_overlay_size(window: Window, width: f64, height: f64) -> Result<(), String> {
    let width = width.max(0.0).round() as u32;
    let height = height.max(0.0).round() as u32;
    window
        .set_size(PhysicalSize { width, height })
        .map_err(|e| e.to_string())
}
