//! # 应用主入口核心要求
//!
//! 本文件实现以下三条不可变约束，修改前请确认改动不会破坏其中任何一条：
//!
//! 1. **任何系统下只允许一个应用实例** —— 通过 `tauri_plugin_single_instance` 实现，
//!    第二次启动时由插件回调聚焦已有实例，第二个进程立即退出。
//! 2. **macOS：关闭主窗口不退出进程** —— `WindowEvent::CloseRequested` 仅
//!    `window.hide() + api.prevent_close()`；点击 Dock 通过
//!    `RunEvent::Reopen`（配合 `has_visible_windows: false` 守卫）重新显示主窗口。
//! 3. **Windows：关闭主窗口直接退出进程** —— `WindowEvent::CloseRequested` 中
//!    `tauri_plugin_single_instance::destroy()` 释放 mutex +
//!    `std::process::exit(0)` 立即终止，避免 updater 后台 task 让进程卡在
//!    `RunEvent::Exit` 之前、mutex 残留、下次启动被误判为已有实例。
//!
//! 其他平台（Linux）走 Tauri 默认行为：关闭最后一个窗口即退出，不主动释放 mutex。
//!
//! ⚠️  调整上述行为前，请先与维护者确认，并同步更新本注释。

mod updater;

// RunEvent 仅在 macOS 的 Dock Reopen 分支使用，限定到目标平台以避免非 macOS 平台触发 unused_imports。
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri_plugin_log::{Target, TargetKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 单实例插件必须最先注册：后续启动由插件回调聚焦已有实例后立即退出。
    // 仅 desktop 支持；mobile 走空 builder，两分支类型一致以支持链式调用。
    #[cfg(desktop)]
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 与 RunEvent::Reopen 一致：show → unminimize → set_focus
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));

    #[cfg(not(desktop))]
    let builder = tauri::Builder::default();

    builder
        .manage(updater::PkgBytes::default())
        .manage(updater::MetadataCache::default())
        // 日志输出到 stdout / LogDir / Webview；失败时降级到 stdout。
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        // macOS：主窗口关闭按钮仅隐藏，由 RunEvent::Reopen 重新显示。
        // Windows：关闭主窗口时立即退出，避免 updater 后台 task 让进程卡在
        // RunEvent::Exit 之前、导致 single-instance mutex 残留、新进程被踢出。
        // std::process::exit 跳过 Tauri/tokio cleanup，但 Windows 会随进程回收资源。
        .on_window_event(|window, _event| {
            if window.label() == "main" {
                #[cfg(target_os = "macos")]
                if let tauri::WindowEvent::CloseRequested { api, .. } = &_event {
                    let _ = window.hide();
                    api.prevent_close();
                }
                #[cfg(target_os = "windows")]
                if let tauri::WindowEvent::CloseRequested { .. } = &_event {
                    tauri_plugin_single_instance::destroy(window.app_handle());
                    std::process::exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            updater::fetch_update_metadata,
            updater::check_install,
            updater::run_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // macOS 点击 Dock 图标时重新聚焦主窗口；其他平台无对应事件
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            {
                if let RunEvent::Reopen {
                    has_visible_windows: false,
                    ..
                } = _event
                {
                    // 与单实例回调一致：show → unminimize → set_focus
                    if let Some(window) = _app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}
