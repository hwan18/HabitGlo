use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, Window};
#[cfg(windows)]
use winapi::shared::windef::{HWND as WinapiHwnd, RECT};
#[cfg(windows)]
use winapi::shared::minwindef::{UINT, WPARAM, LPARAM, LRESULT};
#[cfg(windows)]
use winapi::um::winuser::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST, SetWindowPos, SWP_NOZORDER, SWP_NOACTIVATE, SWP_NOSIZE, RegisterWindowMessageW, SendMessageW, WM_SETREDRAW, RedrawWindow, RDW_INVALIDATE, RDW_FRAME, RDW_ALLCHILDREN};
#[cfg(windows)]
use winapi::um::shellapi::{APPBARDATA, SHAppBarMessage, ABM_NEW, ABM_REMOVE, ABM_SETPOS, ABM_QUERYPOS, ABE_BOTTOM, ABE_TOP};
#[cfg(windows)]
use winapi::um::commctrl::{SetWindowSubclass, DefSubclassProc, RemoveWindowSubclass};

// AppBar notification constants
#[cfg(windows)]
const ABN_POSCHANGED: WPARAM = 0x0001;

// Global state for AppBar callback handling
#[cfg(windows)]
static APPBAR_CALLBACK_MSG: std::sync::OnceLock<u32> = std::sync::OnceLock::new();
#[cfg(windows)]
static APPBAR_STATE: Mutex<Option<AppBarCallbackState>> = Mutex::new(None);

#[cfg(windows)]
struct AppBarCallbackState {
    hwnd: isize,
    edge: u32,  // ABE_TOP or ABE_BOTTOM
    height: i32,
    monitor_left: i32,
    monitor_right: i32,
    monitor_top: i32,
    monitor_bottom: i32,
}

/// Get or register the AppBar callback message ID
#[cfg(windows)]
fn get_appbar_callback_msg() -> u32 {
    *APPBAR_CALLBACK_MSG.get_or_init(|| {
        unsafe {
            let msg_name: Vec<u16> = "HabitGloAppBarMsg\0".encode_utf16().collect();
            RegisterWindowMessageW(msg_name.as_ptr())
        }
    })
}

/// Window subclass procedure to handle AppBar notifications
#[cfg(windows)]
unsafe extern "system" fn appbar_subclass_proc(
    hwnd: WinapiHwnd,
    msg: UINT,
    wparam: WPARAM,
    lparam: LPARAM,
    _uid_subclass: usize,
    _ref_data: usize,
) -> LRESULT {
    let callback_msg = get_appbar_callback_msg();
    
    if msg == callback_msg && wparam == ABN_POSCHANGED {
        // Re-query and set the appbar position
        if let Ok(state) = APPBAR_STATE.lock() {
            if let Some(ref appbar_state) = *state {
                let mut data: APPBARDATA = std::mem::zeroed();
                data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
                data.hWnd = appbar_state.hwnd as WinapiHwnd;
                data.uEdge = appbar_state.edge;
                
                // Set initial rectangle at monitor edge
                data.rc.left = appbar_state.monitor_left;
                data.rc.right = appbar_state.monitor_right;
                
                if appbar_state.edge == ABE_TOP {
                    data.rc.top = appbar_state.monitor_top;
                    data.rc.bottom = appbar_state.monitor_top + appbar_state.height;
                } else {
                    data.rc.bottom = appbar_state.monitor_bottom;
                    data.rc.top = appbar_state.monitor_bottom - appbar_state.height;
                }
                
                // Query position
                SHAppBarMessage(ABM_QUERYPOS, &mut data);
                
                // Adjust based on returned values
                if appbar_state.edge == ABE_TOP {
                    data.rc.bottom = data.rc.top + appbar_state.height;
                } else {
                    data.rc.top = data.rc.bottom - appbar_state.height;
                }
                
                // Set final position
                SHAppBarMessage(ABM_SETPOS, &mut data);
                
                // Move window to match
                SetWindowPos(
                    appbar_state.hwnd as WinapiHwnd,
                    std::ptr::null_mut(),
                    data.rc.left,
                    data.rc.top,
                    data.rc.right - data.rc.left,
                    data.rc.bottom - data.rc.top,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                );
            }
        }
        return 0;
    }
    
    DefSubclassProc(hwnd, msg, wparam, lparam)
}
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
    pub appbar_edge: Mutex<Option<SnapEdge>>,
    pub last_appbar_removed: Mutex<Option<Instant>>,
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
fn infer_snap_edge_for_window(window: &Window) -> Option<SnapEdge> {
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let monitor = get_monitor_area_for_window(window)?;
    let window_mid = pos.y + (size.height as i32 / 2);
    let monitor_mid = monitor.top + ((monitor.bottom - monitor.top) / 2);
    if window_mid <= monitor_mid {
        Some(SnapEdge::Top)
    } else {
        Some(SnapEdge::Bottom)
    }
}

#[cfg(windows)]
const APPBAR_SUBCLASS_ID: usize = 1;

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
    let callback_msg = get_appbar_callback_msg();
    
    unsafe {
        let mut data: APPBARDATA = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        data.hWnd = hwnd.0 as WinapiHwnd;
        data.uCallbackMessage = callback_msg;  // Set callback message for notifications
        SHAppBarMessage(ABM_NEW, &mut data);
        
        // Install subclass to handle AppBar notifications
        SetWindowSubclass(
            hwnd.0 as WinapiHwnd,
            Some(appbar_subclass_proc),
            APPBAR_SUBCLASS_ID,
            0,
        );
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
        // Remove the subclass first
        RemoveWindowSubclass(
            hwnd.0 as WinapiHwnd,
            Some(appbar_subclass_proc),
            APPBAR_SUBCLASS_ID,
        );
        
        let mut data: APPBARDATA = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        data.hWnd = hwnd.0 as WinapiHwnd;
        SHAppBarMessage(ABM_REMOVE, &mut data);
    }
    
    // Clear the global callback state
    if let Ok(mut state) = APPBAR_STATE.lock() {
        *state = None;
    }
    
    *registered = false;
    Ok(())
}

#[cfg(windows)]
fn set_appbar_for_edge(window: &Window, snap_state: &State<SnapState>, edge: SnapEdge, height: i32) -> Result<WorkArea, String> {
    let monitor = get_monitor_area_for_window(window).ok_or("Monitor area not available")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let hwnd_raw = hwnd.0 as WinapiHwnd;
    let abe_edge = match edge {
        SnapEdge::Top => ABE_TOP,
        SnapEdge::Bottom => ABE_BOTTOM,
    };

    // Suppress window redraw during positioning to eliminate flicker
    unsafe {
        SendMessageW(hwnd_raw, WM_SETREDRAW, 0, 0);
    }

    // IMPORTANT: First move window to the full monitor edge BEFORE registering appbar.
    // This ensures Windows calculates the correct appbar position from a clean state.
    unsafe {
        let target_y = match edge {
            SnapEdge::Top => monitor.top,
            SnapEdge::Bottom => monitor.bottom - height,
        };
        SetWindowPos(
            hwnd_raw,
            std::ptr::null_mut(),
            monitor.left,
            target_y,
            0,
            0,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSIZE,
        );
    }

    // Now register the appbar (this also installs the subclass for notifications)
    register_appbar(window, snap_state)?;
    {
        let mut appbar_edge = snap_state
            .appbar_edge
            .lock()
            .map_err(|_| "snap state poisoned")?;
        *appbar_edge = Some(edge);
    }
    
    // Store callback state for ABN_POSCHANGED handling
    {
        let mut state = APPBAR_STATE.lock().map_err(|_| "appbar state poisoned")?;
        *state = Some(AppBarCallbackState {
            hwnd: hwnd.0 as isize,
            edge: abe_edge,
            height,
            monitor_left: monitor.left,
            monitor_right: monitor.right,
            monitor_top: monitor.top,
            monitor_bottom: monitor.bottom,
        });
    }

    let final_rect = unsafe {
        let mut data: APPBARDATA = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        data.hWnd = hwnd_raw;
        data.uEdge = abe_edge;

        // Set initial requested rectangle at full monitor edge
        data.rc.left = monitor.left;
        data.rc.right = monitor.right;
        match edge {
            SnapEdge::Top => {
                data.rc.top = monitor.top;
                data.rc.bottom = monitor.top + height;
            }
            SnapEdge::Bottom => {
                data.rc.bottom = monitor.bottom;
                data.rc.top = monitor.bottom - height;
            }
        }

        // Step 1: Query position - Windows may adjust based on other appbars
        SHAppBarMessage(ABM_QUERYPOS, &mut data);

        // Step 2: Adjust our requested size based on what Windows returned
        match edge {
            SnapEdge::Top => {
                data.rc.bottom = data.rc.top + height;
            }
            SnapEdge::Bottom => {
                data.rc.top = data.rc.bottom - height;
            }
        }

        // Step 3: Set the final position - this reserves the screen space
        SHAppBarMessage(ABM_SETPOS, &mut data);

        let rect = WorkArea {
            left: data.rc.left,
            top: data.rc.top,
            right: data.rc.right,
            bottom: data.rc.bottom,
        };

        // Move window to match the final appbar rectangle
        SetWindowPos(
            hwnd_raw,
            std::ptr::null_mut(),
            rect.left,
            rect.top,
            rect.right - rect.left,
            rect.bottom - rect.top,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );

        rect
    };

    // Re-enable redraw and force a repaint
    unsafe {
        SendMessageW(hwnd_raw, WM_SETREDRAW, 1, 0);
        RedrawWindow(hwnd_raw, std::ptr::null(), std::ptr::null_mut(), RDW_INVALIDATE | RDW_FRAME | RDW_ALLCHILDREN);
    }

    Ok(final_rect)
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
        
        if reserve_space {
            // Reserve screen space using AppBar API
            // Note: set_appbar_for_edge handles window positioning via SetWindowPos
            let _appbar_rect = set_appbar_for_edge(&overlay_window, &snap_state, SnapEdge::Top, win_size.height as i32)?;
            return Ok(());
        } else if let Some(work) = get_work_area_for_window(&overlay_window) {
            // No reservation - just snap to top of work area
            let x = work.left + (work.right - work.left - win_size.width as i32) / 2;
            overlay_window
                .set_position(PhysicalPosition { x, y: work.top })
                .map_err(|e| e.to_string())?;
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
        
        if reserve_space {
            // Reserve screen space using AppBar API
            // Note: set_appbar_for_edge handles window positioning via SetWindowPos
            let _appbar_rect = set_appbar_for_edge(&overlay_window, &snap_state, SnapEdge::Bottom, win_size.height as i32)?;
            return Ok(());
        } else if let Some(work) = get_work_area_for_window(&overlay_window) {
            // No reservation - just snap to bottom of work area
            let x = work.left + (work.right - work.left - win_size.width as i32) / 2;
            let y = work.bottom - (win_size.height as i32);
            let y = y.max(work.top);
            overlay_window
                .set_position(PhysicalPosition { x, y })
                .map_err(|e| e.to_string())?;
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
        let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
        
        if enabled {
            {
                let mut last_removed = snap_state
                    .last_appbar_removed
                    .lock()
                    .map_err(|_| "snap state poisoned")?;
                if last_removed.is_some() {
                    std::thread::sleep(Duration::from_millis(75));
                    *last_removed = None;
                }
            }
            let snapped = *snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
            let inferred = infer_snap_edge_for_window(&overlay_window);
            let edge = inferred.or(snapped);
            if let Some(edge) = edge {
                {
                    let mut snapped = snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
                    *snapped = Some(edge);
                }
                // Re-snap to the last edge so the overlay moves there
                // and reserves space immediately.
                match edge {
                    SnapEdge::Top => snap_to_top(app.clone(), snap_state.clone())?,
                    SnapEdge::Bottom => snap_to_bottom(app.clone(), snap_state.clone())?,
                }
            }
        } else {
            // Remove appbar registration first
            remove_appbar(&overlay_window, &snap_state)?;
            
            // Clear appbar state
            {
                let mut appbar_edge = snap_state
                    .appbar_edge
                    .lock()
                    .map_err(|_| "snap state poisoned")?;
                *appbar_edge = None;
            }
            {
                let mut last_removed = snap_state
                    .last_appbar_removed
                    .lock()
                    .map_err(|_| "snap state poisoned")?;
                *last_removed = Some(Instant::now());
            }
            
            // Reposition window after Windows updates the work area
            let snapped = *snap_state.snapped.lock().map_err(|_| "snap state poisoned")?;
            let win_size = overlay_window.outer_size().map_err(|e| e.to_string())?;
            
            // Poll for work area updates (it can lag briefly)
            for _ in 0..5 {
                std::thread::sleep(std::time::Duration::from_millis(50));
                if let Some(w) = get_work_area_for_window(&overlay_window) {
                    let work_height = w.bottom - w.top;
                    if work_height >= win_size.height as i32 {
                        break;
                    }
                }
            }

            let monitor = get_monitor_area_for_window(&overlay_window).ok_or("Monitor area not available")?;
            let x = monitor.left + (monitor.right - monitor.left - win_size.width as i32) / 2;
            let y = match snapped {
                Some(SnapEdge::Top) => {
                    // Pin to monitor top
                    monitor.top
                }
                Some(SnapEdge::Bottom) => {
                    // Pin to monitor bottom
                    (monitor.bottom - win_size.height as i32).max(monitor.top)
                }
                None => return Ok(()), // Not snapped, nothing to reposition
            };
            
            let hwnd = overlay_window.hwnd().map_err(|e| e.to_string())?;
            unsafe {
                // Set position immediately after removing appbar
                SetWindowPos(
                    hwnd.0 as WinapiHwnd,
                    std::ptr::null_mut(),
                    x,
                    y,
                    0,
                    0,
                    SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSIZE,
                );
            }
            // Re-assert position after a short delay to counter any OS adjustments
            std::thread::sleep(std::time::Duration::from_millis(80));
            unsafe {
                SetWindowPos(
                    hwnd.0 as WinapiHwnd,
                    std::ptr::null_mut(),
                    x,
                    y,
                    0,
                    0,
                    SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSIZE,
                );
            }
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
