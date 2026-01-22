use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, Window};
#[cfg(windows)]
use winapi::shared::windef::{HWND as WinapiHwnd, RECT};
#[cfg(windows)]
use winapi::um::winuser::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
#[cfg(windows)]
use winapi::um::shellapi::{APPBARDATA, SHAppBarMessage, ABM_NEW, ABM_REMOVE, ABM_SETPOS, ABE_BOTTOM, ABE_TOP};
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
    // Which snap is currently active (if any).
    pub snapped: Mutex<Option<SnapEdge>>,
    pub reserve_space: Mutex<bool>,
    pub appbar_registered: Mutex<bool>,
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

#[cfg(windows)]
fn get_monitor_area_for_window(window: &Window) -> Option<WorkArea> {
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
            let rect: RECT = info.rcMonitor;
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

#[cfg(windows)]
fn get_snap_area_for_window(window: &Window, reserve_space: bool) -> Option<WorkArea> {
    if reserve_space {
        get_monitor_area_for_window(window)
    } else {
        get_work_area_for_window(window)
    }
}

#[cfg(windows)]
fn register_appbar(window: &Window, snap_state: &State<SnapState>) -> Result<(), String> {
    let mut registered = snap_state
        .appbar_registered
        .lock()
        .map_err(|_| "snap state poisoned")?;
    if *registered {
        return Ok(());
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let mut data: APPBARDATA = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        data.hWnd = hwnd.0 as WinapiHwnd;
        SHAppBarMessage(ABM_NEW, &mut data);
    }
    *registered = true;
    Ok(())
}

#[cfg(windows)]
fn remove_appbar(window: &Window, snap_state: &State<SnapState>) -> Result<(), String> {
    let mut registered = snap_state
        .appbar_registered
        .lock()
        .map_err(|_| "snap state poisoned")?;
    if !*registered {
        return Ok(());
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let mut data: APPBARDATA = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        data.hWnd = hwnd.0 as WinapiHwnd;
        SHAppBarMessage(ABM_REMOVE, &mut data);
    }
    *registered = false;
    Ok(())
}

#[cfg(windows)]
fn set_appbar_for_edge(window: &Window, snap_state: &State<SnapState>, edge: SnapEdge, height: i32) -> Result<(), String> {
    register_appbar(window, snap_state)?;
    let work = get_monitor_area_for_window(window).ok_or("Monitor area not available")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        let mut data: APPBARDATA = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        data.hWnd = hwnd.0 as WinapiHwnd;
        data.uEdge = match edge {
            SnapEdge::Top => ABE_TOP,
            SnapEdge::Bottom => ABE_BOTTOM,
        };
        data.rc.left = work.left;
        data.rc.right = work.right;
        match edge {
            SnapEdge::Top => {
                data.rc.top = work.top;
                data.rc.bottom = work.top + height;
            }
            SnapEdge::Bottom => {
                data.rc.bottom = work.bottom;
                data.rc.top = work.bottom - height;
            }
        }
        SHAppBarMessage(ABM_SETPOS, &mut data);
    }
    Ok(())
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

    {
        let mut snapped = snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
        *snapped = Some(SnapEdge::Top);
    }

    // Preserve current overlay size; only snap position.
    let win_size = overlay_window.outer_size().map_err(|e| e.to_string())?;

    #[cfg(windows)]
    {
        let reserve_space = *snap_state
            .reserve_space
            .lock()
            .map_err(|_| "snap state poisoned")?;
        if let Some(work) = get_snap_area_for_window(&overlay_window, reserve_space) {
            let x = work.left + (work.right - work.left - win_size.width as i32) / 2;
            overlay_window
                .set_position(PhysicalPosition { x, y: work.top })
                .map_err(|e| e.to_string())?;
            if reserve_space {
                set_appbar_for_edge(&overlay_window, &snap_state, SnapEdge::Top, win_size.height as i32)?;
            }
            return Ok(());
        }
    }

    #[cfg(target_os = "macos")]
    if let Some(work) = get_work_area_for_window(&overlay_window) {
        let x = work.left + (work.right - work.left - win_size.width as i32) / 2;
        overlay_window
            .set_position(PhysicalPosition { x, y: work.top })
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    if let Some(monitor) = overlay_window.current_monitor().map_err(|e| e.to_string())? {
        let monitor_pos = monitor.position();
        let size = monitor.size();
        let x = monitor_pos.x + (size.width as i32 - win_size.width as i32) / 2;
        let y = monitor_pos.y;
        overlay_window
            .set_position(PhysicalPosition { x, y })
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            let reserve_space = *snap_state
                .reserve_space
                .lock()
                .map_err(|_| "snap state poisoned")?;
            if reserve_space {
                set_appbar_for_edge(&overlay_window, &snap_state, SnapEdge::Top, win_size.height as i32)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn snap_to_bottom(app: AppHandle, snap_state: State<SnapState>) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
    {
        let mut snapped = snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
        *snapped = Some(SnapEdge::Bottom);
    }

    // Preserve current overlay size; only snap position.
    let win_size = overlay_window.outer_size().map_err(|e| e.to_string())?;

    #[cfg(windows)]
    {
        let reserve_space = *snap_state
            .reserve_space
            .lock()
            .map_err(|_| "snap state poisoned")?;
        if let Some(work) = get_snap_area_for_window(&overlay_window, reserve_space) {
            let x = work.left + (work.right - work.left - win_size.width as i32) / 2;
            let y = work.bottom - (win_size.height as i32);
            let y = y.max(work.top);

            overlay_window
                .set_position(PhysicalPosition { x, y })
                .map_err(|e| e.to_string())?;
            if reserve_space {
                set_appbar_for_edge(&overlay_window, &snap_state, SnapEdge::Bottom, win_size.height as i32)?;
            }
            return Ok(());
        }
    }

    #[cfg(target_os = "macos")]
    if let Some(work) = get_work_area_for_window(&overlay_window) {
        let x = work.left + (work.right - work.left - win_size.width as i32) / 2;
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
        let x = monitor_pos.x + (size.width as i32 - win_size.width as i32) / 2;
        let y = monitor_pos.y + (size.height as i32) - (win_size.height as i32);
        let y = y.max(monitor_pos.y);

        overlay_window
            .set_position(PhysicalPosition { x, y })
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            let reserve_space = *snap_state
                .reserve_space
                .lock()
                .map_err(|_| "snap state poisoned")?;
            if reserve_space {
                set_appbar_for_edge(&overlay_window, &snap_state, SnapEdge::Bottom, win_size.height as i32)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_reserve_space(app: AppHandle, snap_state: State<SnapState>, enabled: bool) -> Result<(), String> {
    {
        let mut reserve_space = snap_state
            .reserve_space
            .lock()
            .map_err(|_| "snap state poisoned")?;
        *reserve_space = enabled;
    }

    #[cfg(windows)]
    {
        if enabled {
            let snapped = *snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
            if let Some(edge) = snapped {
                // Re-snap to the last edge so the overlay moves there
                // and reserves space immediately.
                match edge {
                    SnapEdge::Top => snap_to_top(app.clone(), snap_state.clone())?,
                    SnapEdge::Bottom => snap_to_bottom(app.clone(), snap_state.clone())?,
                }
            }
        } else {
            let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
            remove_appbar(&overlay_window, &snap_state)?;
        }
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
