use std::fs;
use std::path::{Path, PathBuf};

fn sync_env_template(project_root: &Path, manifest_dir: &Path, source_name: &str, target_name: &str) {
    let source = project_root.join("backend").join(source_name);
    println!("cargo:rerun-if-changed={}", source.display());
    if !source.exists() {
        panic!("missing public env template: {}", source.display());
    }

    let resources_dir = manifest_dir.join("resources");
    let target = resources_dir.join(target_name);
    if let Err(err) = fs::create_dir_all(&resources_dir) {
        panic!("failed to create desktop resources dir: {err}");
    }
    if let Err(err) = fs::copy(&source, &target) {
        panic!(
            "failed to copy {} to {}: {err}",
            source.display(),
            target.display()
        );
    }
}

fn remove_legacy_secret_resource(manifest_dir: &Path, target_name: &str) {
    let target = manifest_dir.join("resources").join(target_name);
    if target.exists() {
        fs::remove_file(&target)
            .unwrap_or_else(|err| panic!("failed to remove legacy resource {}: {err}", target.display()));
    }
}

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let project_root = manifest_dir
        .parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .unwrap_or_else(|| panic!("unable to resolve project root from {}", manifest_dir.display()))
        .to_path_buf();

    remove_legacy_secret_resource(&manifest_dir, "openai.env");
    sync_env_template(&project_root, &manifest_dir, ".env.plaid.example", "plaid.env");
    sync_env_template(&project_root, &manifest_dir, ".env.up.example", "up.env");
    sync_env_template(&project_root, &manifest_dir, ".env.local_ai.example", "local_ai.env");

    tauri_build::build()
}
