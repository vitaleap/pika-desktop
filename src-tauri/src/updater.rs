//! 更新流程：保留 tauri-plugin-updater 用于跨平台安装与下载时的签名校验。
//!
//! - `fetch_update_metadata`: 查远端 manifest 返回元信息（不下载）；
//!   `force=false` 命中进程内缓存时直接返回（仅实时重算 `has_download`）。
//! - `check_install`: 查 PkgBytes；命中即返。`auto_install=true` 时抢下载锁启动异步下载；
//!   抢不到（同 version 已在下载）返 `false`。下载完成后由后端写入 PkgBytes。
//! - `run_install`: 从 PkgBytes 取字节，调 plugin-updater 的 `install`；PkgBytes 为空时
//!   返错让前端重新触发 `check_install`。
//!
//! 磁盘 cache 仅服务于 `check_install(auto_install=true)` 的后台下载路径（`try_download_once`
//! 读复用，避免重下）。不跨进程持久化的 PkgBytes 仅为 `run_install` 的快路径。

use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

/// `<app_data_dir>/installer-cache.json`
const CACHE_FILE: &str = "installer-cache.json";

/// `<app_data_dir>/installer-cache/`
const CACHE_DIR: &str = "installer-cache";

/// 缓存项：保存安装包字节的 SHA256 与字节数，`try_download_once` 命中时校验完整性
#[derive(Clone, Serialize, Deserialize)]
struct InstallerCacheEntry {
    sha256: String,
    size: u64,
}

/// version → cache 索引
#[derive(Default, Serialize, Deserialize)]
struct InstallerCache(HashMap<String, InstallerCacheEntry>);

/// 进程内预下载字节缓存 + 下载锁。
///
/// - `bytes`：`run_install` 直接取用，避免重启后必须重新下载；
/// - `in_flight`：正在下载的 version 集合，避免前端轮询 / 多窗口重复触发并行下载。
///
/// **不跨进程持久化**：进程重启后 `bytes` 为 None；此时 `run_install` 返错、需前端重新触发
/// `check_install`，磁盘 cache 会被 `try_download_once` 复用避免重下。
pub struct PkgBytes {
    bytes: Mutex<Option<PkgInner>>,
    in_flight: Mutex<HashSet<String>>,
}

impl Default for PkgBytes {
    fn default() -> Self {
        Self {
            bytes: Mutex::new(None),
            in_flight: Mutex::new(HashSet::new()),
        }
    }
}

#[derive(Clone)]
struct PkgInner {
    version: String,
    bytes: Vec<u8>,
}

fn set_pkg_bytes<R: Runtime>(app: &AppHandle<R>, version: &str, bytes: Vec<u8>) {
    let Some(state) = app.try_state::<PkgBytes>() else {
        return;
    };
    let Ok(mut guard) = state.bytes.lock() else {
        return;
    };
    *guard = Some(PkgInner {
        version: version.to_string(),
        bytes,
    });
}

/// 从 PkgBytes 中取出并清空当前缓存；返回 `None` 表示为空或锁定失败。
fn take_pkg_bytes<R: Runtime>(app: &AppHandle<R>) -> Option<PkgInner> {
    let state = app.try_state::<PkgBytes>()?;
    let mut guard = state.bytes.lock().ok()?;
    guard.take()
}

/// 抢下载锁：返回 `true` 表示抢到（可启动后台下载），`false` 表示同 version 已在下载中。
///
/// 抢锁后必须在下载完成（成功 / 失败）后调 `release_download_lock` 释放，
/// 避免该 version 永久锁定、后续 `auto_install=true` 不能再下载。
fn try_acquire_download_lock<R: Runtime>(app: &AppHandle<R>, version: &str) -> bool {
    match app.try_state::<PkgBytes>() {
        None => false,
        Some(state) => state
            .in_flight
            .lock()
            .map(|mut g| g.insert(version.to_string()))
            .unwrap_or(false),
    }
}

/// 释放下载锁（调用后同 version 的下一次 `auto_install=true` 可以再启动下载）。
fn release_download_lock<R: Runtime>(app: &AppHandle<R>, version: &str) {
    if let Some(state) = app.try_state::<PkgBytes>() {
        if let Ok(mut guard) = state.in_flight.lock() {
            guard.remove(version);
        }
    }
}

/// 删除指定版本的磁盘安装包与 cache entry（失败不阻塞主流程）
fn invalidate_cache_entry<R: Runtime>(app: &AppHandle<R>, version: &str) {
    if let Ok(path) = installer_path(app, version) {
        let _ = std::fs::remove_file(&path);
    }
    let mut cache = read_cache(app);
    if cache.0.remove(version).is_some() {
        let _ = write_cache(app, &cache);
    }
}

/// GitHub 下载地址反代前缀，按顺序回退
const GITHUB_PROXY_PREFIXES: &[&str] = &["https://gh-proxy.com/", "https://ghfast.top/"];

/// 对 GitHub release 下载 URL 依次探测反代，命中首个可用反代后返回重写后的 URL；非 GitHub release 或反代均不可用时原样返回
async fn rewrite_with_github_proxy(url: Url) -> Url {
    if url.host_str() != Some("github.com") || !url.path().contains("/releases/download/") {
        return url;
    }

    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    else {
        return url;
    };

    for prefix in GITHUB_PROXY_PREFIXES {
        let proxied = format!("{prefix}{url}");
        let reachable = client
            .request(reqwest::Method::OPTIONS, &proxied)
            .send()
            .await
            .map(|r| r.status().is_success() || r.status().is_redirection())
            .unwrap_or(false);
        if reachable {
            if let Ok(parsed) = Url::parse(&proxied) {
                info!("使用 GitHub 反代下载: {parsed}");
                return parsed;
            }
        }
    }

    url
}

/// 前端弹窗需要的元信息
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub current_version: String,
    /// 无更新时为 `null`
    pub latest_version: Option<String>,
    pub notes: Option<String>,
    /// `latest_version` 对应版本是否已下载完成（写入 PkgBytes，实时计算，不进缓存）
    pub has_download: bool,
}

/// `fetch_update_metadata` 的进程内缓存：
/// - update 窗口 focus 切换 / `onMounted` 都会反复触发拉取；
/// - `force=false` 时命中缓存直接返回，避免每次都重走 `updater().check()`；
/// - 不缓存 `has_download`：下载状态独立变化，调用方拿到的应是实时 PkgBytes 快照。
#[derive(Default)]
pub struct MetadataCache {
    inner: Mutex<Option<CachedMetadata>>,
}

#[derive(Clone)]
struct CachedMetadata {
    current_version: String,
    latest_version: Option<String>,
    notes: Option<String>,
}

/// 仅查 PkgBytes 内存，**不读盘**：重启应用后磁盘有但 PkgBytes 未加载时返 `false`。
fn check_has_download<R: Runtime>(app: &AppHandle<R>, version: Option<&str>) -> bool {
    let Some(version) = version else {
        return false;
    };
    let Some(state) = app.try_state::<PkgBytes>() else {
        return false;
    };
    let Ok(guard) = state.bytes.lock() else {
        return false;
    };
    guard.as_ref().is_some_and(|inner| inner.version == version)
}

/// 读 MetadataCache；无缓存或 lock 失败返 None。
fn read_metadata_cache<R: Runtime>(app: &AppHandle<R>) -> Option<CachedMetadata> {
    let state = app.try_state::<MetadataCache>()?;
    let guard = state.inner.lock().ok()?;
    guard.as_ref().cloned()
}

/// 写 MetadataCache；lock 失败静默忽略（仅导致下次重查一次 updater）。
fn write_metadata_cache<R: Runtime>(app: &AppHandle<R>, cached: CachedMetadata) {
    let Some(state) = app.try_state::<MetadataCache>() else {
        return;
    };
    let Ok(mut guard) = state.inner.lock() else {
        return;
    };
    *guard = Some(cached);
}

fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取 app_data_dir: {e}"))
}

fn cache_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(CACHE_FILE))
}

fn installer_path<R: Runtime>(app: &AppHandle<R>, version: &str) -> Result<PathBuf, String> {
    // version 中可能含不合法文件名字符，统一替换
    let safe = version.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    Ok(app_data_dir(app)?
        .join(CACHE_DIR)
        .join(format!("{safe}.bin")))
}

fn read_cache<R: Runtime>(app: &AppHandle<R>) -> InstallerCache {
    let Ok(path) = cache_path(app) else {
        return InstallerCache::default();
    };
    let Ok(bytes) = std::fs::read(&path) else {
        return InstallerCache::default();
    };
    match serde_json::from_slice::<InstallerCache>(&bytes) {
        Ok(cache) => cache,
        Err(e) => {
            warn!("installer-cache.json 格式不兼容（{e}），按空 cache 处理");
            InstallerCache::default()
        }
    }
}

fn write_cache<R: Runtime>(app: &AppHandle<R>, cache: &InstallerCache) -> Result<(), String> {
    let path = cache_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 cache 目录失败: {e}"))?;
    }
    let bytes = serde_json::to_vec(cache).map_err(|e| format!("序列化 cache 失败: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| format!("写入 cache 失败: {e}"))
}

/// 拉取元信息（plugin-updater 完成签名校验）。
///
/// - `force=false`：命中进程内缓存时直接返回（仅实时重算 `has_download`），
///   避免每次都走 `updater().check()`。
/// - `force=true`：跳过缓存强制重查（如主窗口周期性复检）。
///
/// 返回的 `has_download` 表示 `latest_version` 对应版本是否已下载完成（实时查 PkgBytes），
/// 调用方无需再调 `check_install` 判定下载状态。
#[tauri::command]
pub async fn fetch_update_metadata<R: Runtime>(
    app: AppHandle<R>,
    force: bool,
) -> Result<UpdateMetadata, String> {
    let current_version = app.package_info().version.to_string();

    // 非强制且命中缓存：直接返回（仅实时重算 has_download）
    if !force {
        if let Some(cached) = read_metadata_cache(&app) {
            return Ok(UpdateMetadata {
                has_download: check_has_download(&app, cached.latest_version.as_deref()),
                current_version: cached.current_version,
                latest_version: cached.latest_version,
                notes: cached.notes,
            });
        }
    }

    // 强制 / 无缓存：实际查 updater
    let (latest_version, notes) = match app
        .updater()
        .map_err(|e| format!("初始化更新器失败: {e}"))?
        .check()
        .await
    {
        Ok(Some(u)) => (Some(u.version), u.body),
        Ok(None) => (None, None),
        Err(e) => return Err(format!("检查更新失败: {e}")),
    };

    write_metadata_cache(
        &app,
        CachedMetadata {
            current_version: current_version.clone(),
            latest_version: latest_version.clone(),
            notes: notes.clone(),
        },
    );

    Ok(UpdateMetadata {
        has_download: check_has_download(&app, latest_version.as_deref()),
        current_version,
        latest_version,
        notes,
    })
}

/// 抽象 plugin-updater 的 `check` 调用，返回已验签的 Update。
///
/// 对 GitHub release 下载地址尝试反代兜底；反代不可用时保留原 URL，由 plugin-updater 直接下载。
async fn acquire_update<R: Runtime>(app: &AppHandle<R>) -> Result<Update, String> {
    let mut update = app
        .updater()
        .map_err(|e| format!("updater: {e}"))?
        .check()
        .await
        .map_err(|e| format!("check: {e}"))?
        .ok_or_else(|| "无更新".to_string())?;
    debug!(
        "acquire_update: version={} url={}",
        update.version, update.download_url
    );
    update.download_url = rewrite_with_github_proxy(update.download_url.clone()).await;
    Ok(update)
}

/// 从磁盘 cache 读取指定版本的安装包字节，校验 SHA256 完整性。
///
/// 返回 `Ok(bytes)` 当 cache 命中且 SHA256 与 size 都匹配；任何异常（未命中/读失败/
/// size 不一致/哈希不一致）都会调用 `invalidate_cache_entry` 清理缓存并返回 Err。
///
/// 供两个场景复用：
/// - `check_install` 用 `.is_ok()` 做快速路径判断
/// - `run_install` 用 `?` 读取字节后调 `Update::install`
fn read_disk_cache_bytes<R: Runtime>(
    app: &AppHandle<R>,
    expected_version: &str,
) -> Result<Vec<u8>, String> {
    let entry = read_cache(app)
        .0
        .get(expected_version)
        .cloned()
        .ok_or_else(|| "磁盘 cache 不存在".to_string())?;
    let path = installer_path(app, expected_version)?;
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            warn!("磁盘缓存读取失败（{e}），清理后跳过");
            invalidate_cache_entry(app, expected_version);
            return Err(format!("读取磁盘缓存失败: {e}"));
        }
    };
    if (bytes.len() as u64) != entry.size {
        warn!(
            "磁盘缓存大小不一致（文件 {} 字节，cache {} 字节），清理后跳过",
            bytes.len(),
            entry.size
        );
        invalidate_cache_entry(app, expected_version);
        return Err(format!(
            "磁盘缓存大小不一致（文件 {} 字节，cache {} 字节）",
            bytes.len(),
            entry.size
        ));
    }
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual = format!("{:x}", hasher.finalize());
    if actual != entry.sha256 {
        warn!(
            "磁盘缓存 SHA256 不一致（文件 hash {actual}，cache hash {}），清理后跳过",
            entry.sha256
        );
        invalidate_cache_entry(app, expected_version);
        return Err("磁盘缓存 SHA256 不一致".to_string());
    }
    Ok(bytes)
}

/// 命中则从磁盘返回缓存 bytes；未命中才真正下载并落盘。
///
/// 缓存命中校验：磁盘文件大小与 SHA256 都与 cache entry 一致（防截断 / 写入不全）。
/// 任意不一致（未命中 / read_disk_cache_bytes 内部已自行清理）：在这里再补一次防御性清理，
/// 确保进 download 之前没有陈旧的 .bin 与索引依赖。
/// 下载时校验 `update.version == expected_version`，不一致则清理陈旧缓存后报错。
async fn try_download_once<R: Runtime>(
    app: &AppHandle<R>,
    expected_version: &str,
) -> Result<Vec<u8>, String> {
    if let Ok(bytes) = read_disk_cache_bytes(app, expected_version) {
        info!("复用磁盘缓存: {expected_version}");
        return Ok(bytes);
    }

    // 防御性清理：read_disk_cache_bytes 失败时通常已清理，这里再补一次保证后续 download 不会
    // 读到陈旧 .bin 或使用过期 cache entry。
    invalidate_cache_entry(app, expected_version);

    download_and_persist(app, expected_version).await
}

/// 下载 + 写盘 + 更新 cache
async fn download_and_persist<R: Runtime>(
    app: &AppHandle<R>,
    expected_version: &str,
) -> Result<Vec<u8>, String> {
    let update = acquire_update(app).await?;
    if update.version != expected_version {
        // 远端版本已变：清理 expected_version 的陈旧缓存（.bin + 索引），避免后续 run_install
        // 误用。报错让前端重新拉元信息。
        invalidate_cache_entry(app, expected_version);
        return Err(format!(
            "远端版本 {} 与请求 {} 不一致，请重新调 check_install",
            update.version, expected_version
        ));
    }
    let bytes = update
        .download(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("download: {e}"))?;

    let path = installer_path(app, expected_version)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 cache 目录失败: {e}"))?;
    }
    std::fs::write(&path, &bytes).map_err(|e| format!("写入缓存安装包失败: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    let mut cache = read_cache(app);
    cache.0.insert(
        expected_version.to_string(),
        InstallerCacheEntry {
            sha256,
            size: bytes.len() as u64,
        },
    );
    if let Err(e) = write_cache(app, &cache) {
        warn!("写 cache 失败: {e}");
    } else {
        info!("version {expected_version} 安装包已下载并落盘");
    }

    Ok(bytes)
}

/// 检查指定版本安装包是否已就绪；未就绪且 `auto_install=true` 时**异步**启动下载（带防重入锁）。
///
/// - true → 安装包已准备好（命中 PkgBytes）
/// - false → 本次不读盘 / 不下载（`auto_install=false`）**或**下载中
///   （已抢锁启动后台下载 / 同 version 已在下载）
/// - Err → 状态查询异常（极少见）
///
/// `auto_install=true` 时，抢下载锁；抢到则 `tauri::async_runtime::spawn` 启动下载并立即返
/// `false`，抢不到（同 version 已在下载）也立即返 `false`。下载由后台任务完成；下载成功才
/// 释放锁并写入 `PkgBytes`，供 `run_install` 取出字节调用 `install`。下载失败时锁不释放，
/// 后台任务按 10/20/30/.../300s 递增退避无限重试（与前端轮询节奏对齐）。
#[tauri::command]
pub async fn check_install<R: Runtime>(
    app: AppHandle<R>,
    version: String,
    auto_install: bool,
) -> Result<bool, String> {
    // 快路径：PkgBytes 已缓存（不打网络、不读盘）
    if let Some(state) = app.try_state::<PkgBytes>() {
        if let Ok(guard) = state.bytes.lock() {
            if guard.as_ref().is_some_and(|inner| inner.version == version) {
                return Ok(true);
            }
        }
    }

    // auto_install=false：不读盘、不下载，仅返回 false
    if !auto_install {
        return Ok(false);
    }

    // auto_install=true：抢下载锁，避免前端轮询 / 多窗口重复触发并行下载
    if !try_acquire_download_lock(&app, &version) {
        // 同 version 已在下载中，立即返 false 让前端轮询
        return Ok(false);
    }

    // 异步启动下载；下载成功才释放锁，让后续 check_install / run_install 可以消费；
    // 失败按 10/20/30/.../300s 递增退避无限重试，锁持续持有避免并发下载。
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // 后端下载重试退避：起始 10s，每次 +10s，封顶 300s（与前端轮询节奏对齐）
        const RETRY_STEP_SECS: u64 = 10;
        const RETRY_MAX_SECS: u64 = 300;
        let mut delay_secs: u64 = RETRY_STEP_SECS;
        loop {
            match try_download_once(&app_handle, &version).await {
                Ok(bytes) => {
                    info!("下载完成，写入 PkgBytes: {version}");
                    set_pkg_bytes(&app_handle, &version, bytes);
                    break;
                }
                Err(e) => {
                    warn!("后台下载失败 ({version}): {e}，{delay_secs}s 后重试");
                    tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                    delay_secs = (delay_secs + RETRY_STEP_SECS).min(RETRY_MAX_SECS);
                }
            }
        }
        release_download_lock(&app_handle, &version);
    });

    Ok(false)
}

/// 从 PkgBytes 取字节，调 plugin-updater 的 `install`，并在 macOS / Linux 上主动重启进程。
///
/// - Windows：`update.install` 会通过 NSIS/MSI trampoline 自带退出当前进程，无需重启。
/// - macOS / Linux：`update.install` 仅替换磁盘二进制；运行中的进程仍持有旧镜像，
///   必须 `app.restart()` 才能让新版本被加载，否则会"卡在旧版本"的现象。
///
/// 重启放在后端（而非前端 `await relaunch()`）的原因：
/// - `install + 重启` 是原子动作，IPC 异常 / 前端崩溃 / 用户关闭弹窗都不能丢重启；
/// - 前端不需要感知重启细节，`run_install` 返回 `Ok(())` 即视为安装已提交。
#[tauri::command]
pub async fn run_install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // `Update::install(&self, bytes)` 需要 Update 实例拿到目标平台 / 签名键元信息
    let update = acquire_update(&app).await?;
    let inner = take_pkg_bytes(&app).ok_or_else(|| "请先调 check_install".to_string())?;
    update
        .install(&inner.bytes)
        .map_err(|e| format!("install: {e}"))?;
    // Windows：NSIS/MSI trampoline 会替换 exe 后退出当前进程，后续代码走不到。
    // macOS / Linux：install 仅替换磁盘二进制，需 `app.restart()` 让新版本被加载。
    // AppHandle::restart 返回 `!`（never），永不返回。
    #[cfg(target_os = "windows")]
    return Ok(());
    #[cfg(not(target_os = "windows"))]
    app.restart();
}
