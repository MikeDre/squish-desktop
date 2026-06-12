mod commands;
mod dispatch;
mod ffmpeg;
mod options;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri_plugin_autostart::ManagerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Start as accessory; switch to Regular whenever the main window
                // is visible so Cmd-Tab and the Dock behave normally.
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            }

            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let login_item = CheckMenuItem::with_id(
                app,
                "login",
                "Launch at login",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &login_item, &quit_item])?;

            let login_item_for_menu = login_item.clone();

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            #[cfg(target_os = "macos")]
                            {
                                let _ = app.set_activation_policy(ActivationPolicy::Regular);
                            }
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "login" => {
                        let mgr = app.autolaunch();
                        if mgr.is_enabled().unwrap_or(false) {
                            let _ = mgr.disable();
                        } else {
                            let _ = mgr.enable();
                        }
                        // Reflect the real post-toggle state in the menu checkmark.
                        let now_enabled = mgr.is_enabled().unwrap_or(false);
                        let _ = login_item_for_menu.set_checked(now_enabled);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        if let Some(droplet) = tray.app_handle().get_webview_window("droplet") {
                            let visible = droplet.is_visible().unwrap_or(false);
                            if visible {
                                let _ = droplet.hide();
                            } else {
                                let _ = droplet.show();
                                let _ = droplet.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Hide window on close instead of quitting
            let app_handle = app.handle().clone();
            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "macos")]
            {
                // The main window is configured visible in tauri.conf.json, so it
                // is shown on launch — promote to Regular here so the Dock icon is
                // present. (setup starts as Accessory above for the window-less case.)
                let _ = app.set_activation_policy(ActivationPolicy::Regular);
            }
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                    #[cfg(target_os = "macos")]
                    {
                        let _ = app_handle.set_activation_policy(ActivationPolicy::Accessory);
                    }
                }
            });

            // Floating droplet: a small, borderless, always-on-top drop target.
            // Hidden until toggled from the tray. Shares the main bundle; the
            // frontend renders the Droplet view based on this window's label.
            let _droplet = WebviewWindowBuilder::new(
                app,
                "droplet",
                WebviewUrl::default(),
            )
            .title("squish droplet")
            .inner_size(180.0, 180.0)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .build()?;

            // Probe ffmpeg/ffprobe at startup
            ffmpeg::probe_and_cache();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_version,
            commands::squish_files,
            ffmpeg::check_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
