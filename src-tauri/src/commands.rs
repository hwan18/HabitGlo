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

pub const OVERLAY_VISIBILITY_EVENT: &str = "habitglo:overlay-visibility";

fn parse_edge(edge: &str) -> SnapEdge {
    if edge.eq_ignore_ascii_case("bottom") {
        SnapEdge::Bottom
    } else {
        SnapEdge::Top
    }
}

/// Moves the overlay onto the primary monitor if it is somewhere else.
fn ensure_on_primary_monitor(window: &Window) -> Result<(), String> {
    let primary = match window.primary_monitor().map_err(|e| e.to_string())? {
        Some(m) => m,
        None => return Ok(()),
    };
    let current = window.current_monitor().map_err(|e| e.to_string())?;
    let already_there = current
        .map(|m| m.position() == primary.position() && m.size() == primary.size())
        .unwrap_or(false);
    if already_there {
        return Ok(());
    }
    let height = window.outer_size().map_err(|e| e.to_string())?.height;
    window
        .set_size(PhysicalSize { width: primary.size().width, height })
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition { x: primary.position().x, y: primary.position().y })
        .map_err(|e| e.to_string())
}

/// Unregisters the AppBar (reserved screen space) if one is active. Returns true if one was removed.
#[cfg(windows)]
fn release_appbar(window: &Window, snap_state: &State<SnapState>) -> Result<bool, String> {
    let was_registered = *snap_state
        .appbar_registered
        .lock()
        .map_err(|_| "snap state poisoned")?;
    if !was_registered {
        return Ok(false);
    }
    remove_appbar(window, snap_state)?;
    *snap_state.appbar_edge.lock().map_err(|_| "snap state poisoned")? = None;
    *snap_state
        .last_appbar_removed
        .lock()
        .map_err(|_| "snap state poisoned")? = Some(Instant::now());
    Ok(true)
}

/// Docks the overlay full-width at the stored edge of the primary monitor.
/// `reserve_now` registers an AppBar so maximized windows do not cover the strip.
fn apply_overlay_layout(window: &Window, snap_state: &State<SnapState>, reserve_now: bool) -> Result<(), String> {
    let edge = snap_state
        .snapped
        .lock()
        .map_err(|_| "snap state poisoned")?
        .unwrap_or(SnapEdge::Top);

    #[cfg(windows)]
    {
        if reserve_now {
            ensure_on_primary_monitor(window)?;
            let height = window.outer_size().map_err(|e| e.to_string())?.height as i32;
            set_appbar_for_edge(window, snap_state, edge, height)?;
            return Ok(());
        }
        if release_appbar(window, snap_state)? {
            // Give the shell a moment to give the reserved area back before reading the work area.
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    ensure_on_primary_monitor(window)?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    #[cfg(any(windows, target_os = "macos"))]
    let work = get_work_area_for_window(window);
    #[cfg(not(any(windows, target_os = "macos")))]
    let work: Option<WorkArea> = None;

    let work = match work {
        Some(w) => w,
        None => match window.current_monitor().map_err(|e| e.to_string())? {
            Some(m) => WorkArea {
                left: m.position().x,
                top: m.position().y,
                right: m.position().x + m.size().width as i32,
                bottom: m.position().y + m.size().height as i32,
            },
            None => return Ok(()),
        },
    };

    let width = (work.right - work.left).max(1) as u32;
    let y = match edge {
        SnapEdge::Top => work.top,
        SnapEdge::Bottom => (work.bottom - size.height as i32).max(work.top),
    };
    window
        .set_size(PhysicalSize { width, height: size.height })
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition { x: work.left, y })
        .map_err(|e| e.to_string())
}

/// Stores the dock edge ("top" | "bottom") and reserve-space flag, then re-docks the overlay.
#[tauri::command]
pub fn dock_overlay(app: AppHandle, snap_state: State<SnapState>, edge: String, reserve: bool) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
    *snap_state.snapped.lock().map_err(|_| "snap state poisoned")? = Some(parse_edge(&edge));
    *snap_state.reserve_space.lock().map_err(|_| "snap state poisoned")? = reserve;
    let visible = overlay_window.is_visible().unwrap_or(false);
    apply_overlay_layout(&overlay_window, &snap_state, reserve && visible)
}

/// Shows or hides the LED strip. Hiding also gives reserved screen space back to other windows.
pub fn set_overlay_visibility(app: &AppHandle, visible: bool) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
    let snap_state = app.state::<SnapState>();
    if visible {
        let reserve = *snap_state.reserve_space.lock().map_err(|_| "snap state poisoned")?;
        apply_overlay_layout(&overlay_window, &snap_state, reserve)?;
        overlay_window.show().map_err(|e| e.to_string())?;
    } else {
        #[cfg(windows)]
        release_appbar(&overlay_window, &snap_state)?;
        overlay_window.hide().map_err(|e| e.to_string())?;
    }
    let _ = app
        .tray_handle()
        .get_item(TRAY_TOGGLE_LED)
        .set_title(if visible { "Hide LED" } else { "Show LED" });
    let _ = app.emit_all(OVERLAY_VISIBILITY_EVENT, visible);
    Ok(())
}

pub const TRAY_OPEN: &str = "open";
pub const TRAY_TOGGLE_LED: &str = "toggle_led";
pub const TRAY_QUIT: &str = "quit";

/// Tray "Show LED" / "Hide LED".
pub fn toggle_overlay_visibility(app: &AppHandle) -> Result<(), String> {
    let overlay_window = app.get_window("overlay").ok_or("Overlay window not found")?;
    let visible = overlay_window.is_visible().map_err(|e| e.to_string())?;
    set_overlay_visibility(app, !visible)
}

#[tauri::command]
pub fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    set_overlay_visibility(&app, visible)
}

pub const MAIN_VISIBILITY_EVENT: &str = "habitglo:main-visibility";

/// Shows and focuses the main window; its LED preview resumes when it hears the event.
pub fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    let _ = app.emit_all(MAIN_VISIBILITY_EVENT, true);
}

/// Hides the main window (the app keeps running in the tray); its LED preview stops animating.
pub fn hide_main_window(window: &Window) {
    let _ = window.hide();
    let _ = window.app_handle().emit_all(MAIN_VISIBILITY_EVENT, false);
}

/// Removes the AppBar before the process exits so Windows does not keep an empty reserved band.
pub fn release_overlay_space(app: &AppHandle) {
    #[cfg(windows)]
    if let Some(overlay_window) = app.get_window("overlay") {
        let snap_state = app.state::<SnapState>();
        let _ = release_appbar(&overlay_window, &snap_state);
    }
    #[cfg(not(windows))]
    let _ = app;
}
