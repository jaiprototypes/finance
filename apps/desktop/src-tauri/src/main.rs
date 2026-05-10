use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

struct BackendState(Mutex<Option<Child>>);

const PLAID_OAUTH_REDIRECT_HOST: &str = "tauri.localhost";
const PLAID_OAUTH_REDIRECT_PATH: &str = "/plaid-oauth";

fn resolve_backend_path_from_resource_dir(resource_dir: &Path) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let candidate_paths = [
        resource_dir.join("backend"),
        resource_dir.join("resources").join("backend"),
    ];

    for candidate in candidate_paths {
        if !candidate.exists() {
            continue;
        }
        if candidate.is_file() {
            return Ok(candidate);
        }
        let nested_executable = candidate.join("backend");
        if nested_executable.is_file() {
            return Ok(nested_executable);
        }
    }

    if !resource_dir.join("backend").exists() && !resource_dir.join("resources").join("backend").exists() {
        return Err(format!(
            "Backend binary not found in {:?} or {:?}",
            resource_dir.join("backend"),
            resource_dir.join("resources").join("backend")
        )
        .into());
    }

    Err(format!(
        "Backend executable not found in {:?} or {:?}",
        resource_dir.join("backend"),
        resource_dir.join("resources").join("backend")
    )
    .into())
}

fn resolve_backend_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    resolve_backend_path_from_resource_dir(&resource_dir)
}

fn read_env_file(path: &Path) -> HashMap<String, String> {
    let mut envs = HashMap::new();
    let Ok(contents) = fs::read_to_string(path) else {
        return envs;
    };
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut parts = trimmed.splitn(2, '=');
        let Some(key) = parts.next() else { continue };
        let Some(value) = parts.next() else { continue };
        let value = value.trim().trim_matches('"').trim_matches('\'');
        envs.insert(key.trim().to_string(), value.to_string());
    }
    envs
}

fn resolve_envs(
    resource_dir: &Path,
    app_data_dir: &Path,
    file_name: &str,
    label: &str,
) -> HashMap<String, String> {
    let app_env_path = app_data_dir.join(file_name);
    if app_env_path.exists() {
        return read_env_file(&app_env_path);
    }

    let resource_candidates = [
        resource_dir.join(file_name),
        resource_dir.join("resources").join(file_name),
    ];
    for candidate in resource_candidates {
        if candidate.exists() {
            if let Err(err) = fs::create_dir_all(app_data_dir) {
                eprintln!("Failed to create app data dir: {err}");
            } else if let Err(err) = fs::copy(&candidate, &app_env_path) {
                eprintln!("Failed to seed {label} env template: {err}");
            }
            if app_env_path.exists() {
                return read_env_file(&app_env_path);
            }
            return read_env_file(&candidate);
        }
    }

    if app_env_path.exists() {
        return read_env_file(&app_env_path);
    }

    HashMap::new()
}

fn resolve_plaid_envs(resource_dir: &PathBuf, app_data_dir: &PathBuf) -> HashMap<String, String> {
    resolve_envs(resource_dir, app_data_dir, "plaid.env", "Plaid")
}

fn resolve_up_envs(resource_dir: &PathBuf, app_data_dir: &PathBuf) -> HashMap<String, String> {
    resolve_envs(resource_dir, app_data_dir, "up.env", "Up")
}

fn resolve_local_ai_envs(resource_dir: &PathBuf, app_data_dir: &PathBuf) -> HashMap<String, String> {
    resolve_envs(resource_dir, app_data_dir, "local_ai.env", "Local AI")
}

fn terminate_existing_bundled_backends(backend_path: &Path) {
    let Some(backend_str) = backend_path.to_str() else {
        return;
    };
    let Ok(output) = Command::new("pgrep").args(["-f", backend_str]).output() else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let current_pid = std::process::id();
    let pid_list = String::from_utf8_lossy(&output.stdout);
    for line in pid_list.lines() {
        let Ok(pid) = line.trim().parse::<u32>() else {
            continue;
        };
        if pid == current_pid {
            continue;
        }
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).status();
    }
}

fn process_looks_like_finances_backend(pid: u32) -> bool {
    let Ok(output) = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm=", "-o", "args="])
        .output()
    else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let process = String::from_utf8_lossy(&output.stdout).to_lowercase();
    process.contains("backend")
        && (process.contains("finances.app")
            || process.contains("com.jai.finances")
            || process.contains("debt management")
            || process.contains("/resources/backend"))
}

fn terminate_finances_backends_on_port(port: &str) {
    let Ok(output) = Command::new("lsof")
        .args(["-nP", &format!("-tiTCP:{port}"), "-sTCP:LISTEN"])
        .output()
    else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let current_pid = std::process::id();
    let pid_list = String::from_utf8_lossy(&output.stdout);
    let mut terminated = false;
    for line in pid_list.lines() {
        let Ok(pid) = line.trim().parse::<u32>() else {
            continue;
        };
        if pid == current_pid || !process_looks_like_finances_backend(pid) {
            continue;
        }
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).status();
        terminated = true;
    }
    if terminated {
        thread::sleep(Duration::from_millis(500));
    }
}

fn wait_for_backend_ready(port: &str) -> bool {
    let addr = format!("127.0.0.1:{port}");
    for _ in 0..120 {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(500));
    }
    false
}

fn unique_child_window_label(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{prefix}{nanos}")
}

fn is_plaid_oauth_redirect(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some(PLAID_OAUTH_REDIRECT_HOST)
        && url.path() == PLAID_OAUTH_REDIRECT_PATH
}

fn plaid_oauth_app_path(url: &tauri::Url) -> String {
    match url.query() {
        Some(query) => format!("{PLAID_OAUTH_REDIRECT_PATH}?{query}"),
        None => PLAID_OAUTH_REDIRECT_PATH.to_string(),
    }
}

fn open_plaid_oauth_return_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
    redirect_url: &tauri::Url,
) -> tauri::Result<()> {
    WebviewWindowBuilder::new(
        app,
        unique_child_window_label("plaid-oauth"),
        WebviewUrl::App(plaid_oauth_app_path(redirect_url).into()),
    )
    .title("Plaid login")
    .inner_size(460.0, 560.0)
    .use_https_scheme(true)
    .build()
    .map(|_| ())
}

fn create_external_child_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
    url: tauri::Url,
    features: tauri::webview::NewWindowFeatures,
) -> tauri::webview::NewWindowResponse<R> {
    let Ok(blank_url) = "about:blank".parse() else {
        return tauri::webview::NewWindowResponse::Deny;
    };
    let label = unique_child_window_label("external");
    let navigation_app = app.clone();
    let navigation_label = label.clone();
    let builder = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::External(blank_url),
    )
    .window_features(features)
    .use_https_scheme(true)
    .on_navigation(move |navigation_url| {
        if !is_plaid_oauth_redirect(navigation_url) {
            return true;
        }
        if let Err(err) = open_plaid_oauth_return_window(&navigation_app, navigation_url) {
            eprintln!("Failed to open Plaid OAuth return window for {navigation_url}: {err}");
        }
        if let Some(window) = navigation_app.get_webview_window(&navigation_label) {
            let _ = window.close();
        }
        false
    })
    .title(url.as_str())
    .on_document_title_changed(|window, title| {
        let _ = window.set_title(&title);
    });

    match builder.build() {
        Ok(window) => tauri::webview::NewWindowResponse::Create { window },
        Err(err) => {
            eprintln!("Failed to create external webview window for {url}: {err}");
            tauri::webview::NewWindowResponse::Deny
        }
    }
}

fn build_main_window<R: Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let Some(window_config) = app.config().app.windows.first().cloned() else {
        return Err("Main window config not found".into());
    };
    let app_handle = app.handle().clone();
    WebviewWindowBuilder::from_config(app.handle(), &window_config)?
        .use_https_scheme(true)
        .on_new_window(move |url, features| create_external_child_window(&app_handle, url, features))
        .build()?;
    Ok(())
}

fn spawn_backend<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let backend_path = resolve_backend_path(app)?;

    terminate_existing_bundled_backends(&backend_path);

    let log_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("Finances"));
    std::fs::create_dir_all(&log_dir)?;
    let log_path = log_dir.join("backend.log");
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;

    let plaid_envs = resolve_plaid_envs(&resource_dir, &log_dir);
    let up_envs = resolve_up_envs(&resource_dir, &log_dir);
    let local_ai_envs = resolve_local_ai_envs(&resource_dir, &log_dir);
    let mut command = Command::new(backend_path);
    command.env("BACKEND_HOST", "127.0.0.1");

    let backend_port = plaid_envs
        .get("BACKEND_PORT")
        .cloned()
        .or_else(|| std::env::var("BACKEND_PORT").ok())
        .unwrap_or_else(|| "8123".to_string());
    command.env("BACKEND_PORT", &backend_port);

    terminate_finances_backends_on_port(&backend_port);

    if let Some(value) = plaid_envs
        .get("PLAID_CLIENT_ID")
        .cloned()
        .or_else(|| std::env::var("PLAID_CLIENT_ID").ok())
    {
        command.env("PLAID_CLIENT_ID", value);
    }
    if let Some(value) = plaid_envs
        .get("PLAID_SECRET")
        .cloned()
        .or_else(|| std::env::var("PLAID_SECRET").ok())
    {
        command.env("PLAID_SECRET", value);
    }
    if let Some(value) = plaid_envs
        .get("PLAID_ENV")
        .cloned()
        .or_else(|| std::env::var("PLAID_ENV").ok())
    {
        command.env("PLAID_ENV", value);
    }
    if let Some(value) = plaid_envs
        .get("PLAID_REDIRECT_URI")
        .cloned()
        .or_else(|| std::env::var("PLAID_REDIRECT_URI").ok())
    {
        command.env("PLAID_REDIRECT_URI", value);
    }

    if let Some(value) = up_envs
        .get("UP_API_KEY")
        .cloned()
        .or_else(|| std::env::var("UP_API_KEY").ok())
    {
        command.env("UP_API_KEY", value);
    }

    if let Some(value) = local_ai_envs
        .get("LOCAL_AI_ENABLED")
        .cloned()
        .or_else(|| std::env::var("LOCAL_AI_ENABLED").ok())
    {
        command.env("LOCAL_AI_ENABLED", value);
    }
    if let Some(value) = local_ai_envs
        .get("LOCAL_AI_BASE_URL")
        .cloned()
        .or_else(|| std::env::var("LOCAL_AI_BASE_URL").ok())
    {
        command.env("LOCAL_AI_BASE_URL", value);
    }
    if let Some(value) = local_ai_envs
        .get("LOCAL_AI_MODEL")
        .cloned()
        .or_else(|| std::env::var("LOCAL_AI_MODEL").ok())
    {
        command.env("LOCAL_AI_MODEL", value);
    }
    if let Some(value) = local_ai_envs
        .get("LOCAL_AI_TIMEOUT_SECONDS")
        .cloned()
        .or_else(|| std::env::var("LOCAL_AI_TIMEOUT_SECONDS").ok())
    {
        command.env("LOCAL_AI_TIMEOUT_SECONDS", value);
    }

    let mut child = command
        .stdout(Stdio::from(log_file.try_clone()?))
        .stderr(Stdio::from(log_file))
        .spawn()?;

    if !wait_for_backend_ready(&backend_port) {
        let _ = child.kill();
        return Err(format!("Bundled backend did not bind 127.0.0.1:{backend_port} in time").into());
    }
    if let Some(status) = child.try_wait()? {
        return Err(format!("Bundled backend exited while starting: {status}").into());
    }

    let state = app.state::<BackendState>();
    *state.0.lock().unwrap() = Some(child);
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .manage(BackendState(Mutex::new(None)))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            spawn_backend(&app.handle())?;
            build_main_window(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Ok(backend_path) = resolve_backend_path(&window.app_handle()) {
                    terminate_existing_bundled_backends(&backend_path);
                }
                if let Some(mut child) = window.app_handle().state::<BackendState>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            if let Ok(backend_path) = resolve_backend_path(app_handle) {
                terminate_existing_bundled_backends(&backend_path);
            }
            if let Some(mut child) = app_handle.state::<BackendState>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{resolve_backend_path_from_resource_dir, resolve_local_ai_envs, resolve_plaid_envs};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("finances-{prefix}-{nanos}"))
    }

    #[test]
    fn copies_comment_only_local_ai_template_to_app_data() {
        let base_dir = unique_temp_dir("local-ai-template");
        let resource_dir = base_dir.join("bundle");
        let app_data_dir = base_dir.join("app-data");
        let template_dir = resource_dir.join("resources");
        let template_path = template_dir.join("local_ai.env");
        let template = "# LOCAL_AI_ENABLED=false\n# LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1\n# LOCAL_AI_MODEL=qwen2.5:7b-instruct\n# LOCAL_AI_TIMEOUT_SECONDS=30\n";

        fs::create_dir_all(&template_dir).unwrap();
        fs::write(&template_path, template).unwrap();

        let envs = resolve_local_ai_envs(&resource_dir, &app_data_dir);

        assert!(envs.is_empty());
        assert_eq!(fs::read_to_string(app_data_dir.join("local_ai.env")).unwrap(), template);

        fs::remove_dir_all(base_dir).unwrap();
    }

    #[test]
    fn prefers_existing_app_data_local_ai_env() {
        let base_dir = unique_temp_dir("local-ai-existing");
        let resource_dir = base_dir.join("bundle");
        let app_data_dir = base_dir.join("app-data");
        let app_env_path = app_data_dir.join("local_ai.env");

        fs::create_dir_all(&app_data_dir).unwrap();
        fs::write(
            &app_env_path,
            "LOCAL_AI_ENABLED=true\nLOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1\nLOCAL_AI_MODEL=qwen2.5:7b-instruct\n",
        )
        .unwrap();

        let envs = resolve_local_ai_envs(&resource_dir, &app_data_dir);

        assert_eq!(envs.get("LOCAL_AI_ENABLED").map(String::as_str), Some("true"));
        assert_eq!(
            envs.get("LOCAL_AI_BASE_URL").map(String::as_str),
            Some("http://127.0.0.1:11434/v1")
        );
        assert_eq!(envs.get("LOCAL_AI_MODEL").map(String::as_str), Some("qwen2.5:7b-instruct"));

        fs::remove_dir_all(base_dir).unwrap();
    }

    #[test]
    fn keeps_existing_plaid_env_when_bundle_has_values() {
        let base_dir = unique_temp_dir("plaid-existing");
        let resource_dir = base_dir.join("bundle");
        let app_data_dir = base_dir.join("app-data");
        let template_dir = resource_dir.join("resources");
        let bundled_path = template_dir.join("plaid.env");
        let app_env_path = app_data_dir.join("plaid.env");
        let bundled = "PLAID_CLIENT_ID=new-id\nPLAID_SECRET=new-secret\nPLAID_ENV=production\n";
        let stale = "PLAID_CLIENT_ID=old-id\nPLAID_SECRET=old-secret\nPLAID_ENV=sandbox\n";

        fs::create_dir_all(&template_dir).unwrap();
        fs::create_dir_all(&app_data_dir).unwrap();
        fs::write(&bundled_path, bundled).unwrap();
        fs::write(&app_env_path, stale).unwrap();

        let envs = resolve_plaid_envs(&resource_dir, &app_data_dir);

        assert_eq!(envs.get("PLAID_ENV").map(String::as_str), Some("sandbox"));
        assert_eq!(fs::read_to_string(&app_env_path).unwrap(), stale);

        fs::remove_dir_all(base_dir).unwrap();
    }

    #[test]
    fn resolves_onedir_backend_executable_inside_backend_directory() {
        let base_dir = unique_temp_dir("backend-onedir");
        let resource_dir = base_dir.join("bundle");
        let backend_dir = resource_dir.join("backend");
        let backend_executable = backend_dir.join("backend");

        fs::create_dir_all(&backend_dir).unwrap();
        fs::write(&backend_executable, "").unwrap();

        let resolved = resolve_backend_path_from_resource_dir(&resource_dir).unwrap();

        assert_eq!(resolved, backend_executable);

        fs::remove_dir_all(base_dir).unwrap();
    }
}
