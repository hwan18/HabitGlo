use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, Window};
#[cfg(windows)]
use winapi::shared::windef::{HWND as WinapiHwnd, RECT};
#[cfg(windows)]
use winapi::um::winuser::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
#[cfg(target_os = "macos")]
use cocoa::appkit::NSScreen;
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::NSRect;
#[cfg(target_os = "macos")]
use objc::{msg_send, runtime::Object};

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

#[derive(Clone, Copy)]
struct WorkArea {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(windows)]
fn get_work_area_for_window(window: &Window) -> Option<WorkArea> {
    let hwnd = window.hwnd().ok()?;
    let hmonitor = unsafe { MonitorFromWindow(hwnd.0 as WinapiHwnd, MONITOR_DEFAULTTONEAREST) };
    if hmonitor.is_null() {
        return None;
    }
    unsafe {
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        let ok = GetMonitorInfoW(hmonitor, &mut info as *mut MONITORINFO);
        if ok != 0 {
            let rect: RECT = info.rcWork;
            Some(WorkArea {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            })
        } else {
            None
        }
    }
}

#[cfg(target_os = "macos")]
fn get_work_area_for_window(window: &Window) -> Option<WorkArea> {
    let ns_window = window.ns_window().ok()? as id;
    if ns_window == nil {
        return None;
    }
    unsafe {
        let mut screen: id = msg_send![ns_window, screen];
        if screen == nil {
            screen = NSScreen::mainScreen();
        }
        if screen == nil {
            return None;
        }

        let frame: NSRect = msg_send![screen, frame];
        let visible: NSRect = msg_send![screen, visibleFrame];
        let scale: f64 = msg_send![screen, backingScaleFactor];

        let frame_h = frame.size.height;
        let left = visible.origin.x;
        let right = visible.origin.x + visible.size.width;
        let top = frame_h - (visible.origin.y + visible.size.height);
        let bottom = frame_h - visible.origin.y;

        let monitor = window.current_monitor().ok().flatten()?;
        let monitor_pos = monitor.position();

        Some(WorkArea {
            left: monitor_pos.x + (left * scale).round() as i32,
            top: monitor_pos.y + (top * scale).round() as i32,
            right: monitor_pos.x + (right * scale).round() as i32,
            bottom: monitor_pos.y + (bottom * scale).round() as i32,
        })
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

    #[cfg(any(windows, target_os = "macos"))]
    if let Some(work) = get_work_area_for_window(&overlay_window) {
        let min_x = work.left;
        let max_x = work.right - (win_size.width as i32);
        let x = win_pos.x.clamp(min_x, max_x.max(min_x));
        overlay_window
            .set_position(PhysicalPosition { x, y: work.top })
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    if let Some(monitor) = overlay_window.current_monitor().map_err(|e| e.to_string())? {
        let monitor_pos = monitor.position();
        let size = monitor.size();
        let min_x = monitor_pos.x;
        let max_x = monitor_pos.x + (size.width as i32) - (win_size.width as i32);
        let x = win_pos.x.clamp(min_x, max_x.max(min_x));
        let y = monitor_pos.y;
        overlay_window
            .set_position(PhysicalPosition { x, y })
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

    #[cfg(any(windows, target_os = "macos"))]
    if let Some(work) = get_work_area_for_window(&overlay_window) {
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
        let monitor_pos = monitor.position();
        let size = monitor.size();
        let min_x = monitor_pos.x;
        let max_x = monitor_pos.x + (size.width as i32) - (win_size.width as i32);
        let x = win_pos.x.clamp(min_x, max_x.max(min_x));

        let y = monitor_pos.y + (size.height as i32) - (win_size.height as i32);
        let y = y.max(monitor_pos.y);

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
