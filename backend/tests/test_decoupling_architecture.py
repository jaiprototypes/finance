import ast
from pathlib import Path

from backend.app.core.db_base import Base
from backend.app.features import models as feature_models
from backend.app.features.registry import registry
from backend.app.main import app


ROOT = Path(__file__).resolve().parents[2]
BACKEND_FEATURES = {
    "ledger",
    "taxonomy",
    "classification",
    "budgeting",
    "receivables",
    "connectors",
    "imports",
    "reports",
    "settings",
    "assistant",
    "fx",
    "debts",
    "timesheets",
    "diagnostics",
    "demo",
}
FRONTEND_FEATURES = {
    "accounts",
    "budgets",
    "business",
    "dashboard",
    "debts",
    "diagnostics",
    "fx",
    "imports",
    "reports",
    "settings",
    "timesheets",
    "transactions",
}
SPLIT_FRONTEND_FEATURES = {
    "budgets",
    "business",
    "reports",
    "settings",
    "timesheets",
    "transactions",
}
HOOKED_FRONTEND_FEATURES = SPLIT_FRONTEND_FEATURES
SECTIONED_FRONTEND_FEATURES = {
    "business",
    "settings",
    "timesheets",
    "transactions",
}


def _python_files(root: Path):
    return root.rglob("*.py") if root.exists() else ()


def _feature_import_edges() -> dict[str, set[str]]:
    feature_root = ROOT / "backend" / "app" / "features"
    edges: dict[str, set[str]] = {}
    for path in feature_root.rglob("*.py"):
        relative_parts = path.relative_to(feature_root).parts
        if len(relative_parts) < 2:
            continue
        if path.name in {"manifest.py", "registry.py"}:
            continue
        origin = relative_parts[0]
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            target = None
            if node.level == 2 and node.module:
                target = node.module.split(".")[0]
            elif node.level == 0 and node.module and node.module.startswith("backend.app.features."):
                target = node.module.split(".")[3]
            if target and target != origin and (feature_root / target).is_dir():
                edges.setdefault(origin, set()).add(target)
    return edges


def _strongly_connected_components(edges: dict[str, set[str]]) -> list[list[str]]:
    nodes = sorted({*edges, *(target for targets in edges.values() for target in targets)})
    index = 0
    stack: list[str] = []
    on_stack: set[str] = set()
    indices: dict[str, int] = {}
    lowlinks: dict[str, int] = {}
    components: list[list[str]] = []

    def visit(node: str) -> None:
        nonlocal index
        indices[node] = index
        lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)

        for target in edges.get(node, set()):
            if target not in indices:
                visit(target)
                lowlinks[node] = min(lowlinks[node], lowlinks[target])
            elif target in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[target])

        if lowlinks[node] != indices[node]:
            return

        component: list[str] = []
        while stack:
            target = stack.pop()
            on_stack.remove(target)
            component.append(target)
            if target == node:
                break
        components.append(sorted(component))

    for node in nodes:
        if node not in indices:
            visit(node)
    return components


def test_feature_packages_have_standard_entrypoints():
    feature_root = ROOT / "backend" / "app" / "features"
    for package in BACKEND_FEATURES:
        package_dir = feature_root / package
        assert (package_dir / "__init__.py").exists()
        assert (package_dir / "manifest.py").exists()
        assert (package_dir / "router.py").exists()
        assert (package_dir / "service.py").exists()


def test_feature_registry_declares_backend_modules_and_routes():
    assert set(registry.keys) == BACKEND_FEATURES
    assert len(registry.versioned_routers()) >= len(BACKEND_FEATURES)
    assert registry.stable_root_routers()
    for manifest in registry.manifests:
        assert manifest.routes
        assert all(dependency in registry.keys for dependency in manifest.dependencies)


def test_feature_import_graph_has_no_cycles():
    cycles = [component for component in _strongly_connected_components(_feature_import_edges()) if len(component) > 1]
    assert not cycles


def test_versioned_api_and_stable_readiness_routes_are_registered():
    paths = {route.path for route in app.routes}
    assert "/health" in paths
    assert "/diagnostics/status" in paths
    assert "/api/v1/transactions/details" in paths
    assert "/api/v1/receivables/reconcile" in paths
    assert "/transactions/details" not in paths
    assert "/receivables/reconcile" not in paths


def test_feature_routers_do_not_import_legacy_api_modules():
    feature_root = ROOT / "backend" / "app" / "features"
    offenders: list[str] = []
    for path in feature_root.rglob("*router.py"):
        text = path.read_text(encoding="utf-8")
        if "backend.app.api" in text or ".api" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert not offenders


def test_legacy_api_modules_are_removed():
    assert not (ROOT / "backend" / "app" / "api").exists()


def test_app_composition_uses_feature_entrypoints():
    main_text = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
    router_text = (ROOT / "backend" / "app" / "features" / "router.py").read_text(encoding="utf-8")
    assert ".api" not in main_text
    assert ".services" not in main_text
    assert "registry." in router_text
    assert "from .assistant" not in router_text


def test_feature_code_does_not_import_legacy_services():
    offenders: list[str] = []
    for path in (ROOT / "backend" / "app" / "features").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "backend.app.services" in text or "...services" in text or "..services" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert not offenders


def test_legacy_service_modules_are_removed():
    assert not (ROOT / "backend" / "app" / "services").exists()


def test_models_and_schemas_are_feature_owned():
    feature_root = ROOT / "backend" / "app" / "features"
    offenders: list[str] = []
    for path in feature_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "...models" in text or "...schemas" in text or "backend.app.models" in text or "backend.app.schemas" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert not offenders

    assert feature_models.Base is Base
    assert {"account", "transactions", "invoice", "app_setting"} <= set(Base.metadata.tables)


def test_root_model_and_schema_modules_are_removed():
    for relative_path in ["backend/app/models.py", "backend/app/schemas.py"]:
        assert not (ROOT / relative_path).exists()


def test_removed_budget_group_code_is_not_referenced_by_scripts_or_services():
    search_roots = [ROOT / "backend" / "app", ROOT / "backend" / "scripts", ROOT / "scripts"]
    offenders: list[str] = []
    for search_root in search_roots:
        if not search_root.exists():
            continue
        for path in search_root.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if "budget_groups" in text:
                offenders.append(str(path.relative_to(ROOT)))
    assert not offenders


def test_scripts_do_not_import_private_api_modules():
    offenders: list[str] = []
    private_imports = ("backend.app.api", "backend.app.services", "backend.app.models", "backend.app.schemas")
    for script_root in [ROOT / "scripts", ROOT / "backend" / "scripts"]:
        for path in _python_files(script_root):
            text = path.read_text(encoding="utf-8")
            if any(import_path in text for import_path in private_imports):
                offenders.append(str(path.relative_to(ROOT)))
    assert not offenders


def test_classification_owns_rule_routes():
    taxonomy_rules = ROOT / "backend" / "app" / "features" / "taxonomy" / "rules_router.py"
    classification_rules = ROOT / "backend" / "app" / "features" / "classification" / "rules_router.py"
    assert not taxonomy_rules.exists()
    assert classification_rules.exists()


def test_budgeting_owns_budget_projection_services():
    budgeting_service = (ROOT / "backend" / "app" / "features" / "budgeting" / "service.py").read_text(
        encoding="utf-8"
    )
    budgeting_reporting = ROOT / "backend" / "app" / "features" / "budgeting" / "reporting.py"
    reports_service = (ROOT / "backend" / "app" / "features" / "reports" / "service.py").read_text(
        encoding="utf-8"
    )
    assert budgeting_reporting.exists()
    assert "..reports" not in budgeting_service
    assert "def budget_status(" not in reports_service
    assert "def budget_matrix(" not in reports_service
    assert "from ..budgeting.reporting import" in reports_service


def test_fx_does_not_import_budgeting_feature():
    offenders: list[str] = []
    for path in (ROOT / "backend" / "app" / "features" / "fx").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "..budgeting" in text or "backend.app.features.budgeting" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert not offenders
    budgeting_manifest = next(manifest for manifest in registry.manifests if manifest.key == "budgeting")
    fx_manifest = next(manifest for manifest in registry.manifests if manifest.key == "fx")
    assert "fx" in budgeting_manifest.dependencies
    assert "budgeting" not in fx_manifest.dependencies


def test_core_owns_base_currency_helpers():
    core_currency = ROOT / "backend" / "app" / "core" / "currency.py"
    assert core_currency.exists()
    assert "DEFAULT_BASE_CURRENCY" in core_currency.read_text(encoding="utf-8")

    guarded_paths = [
        ROOT / "backend" / "app" / "features" / "budgeting" / "reporting.py",
        ROOT / "backend" / "app" / "features" / "fx" / "currency.py",
    ]
    for path in guarded_paths:
        text = path.read_text(encoding="utf-8")
        assert "..settings" not in text
        assert "backend.app.features.settings" not in text
        assert "...core.currency" in text


def test_frontend_entry_and_api_client_are_decoupled():
    app_entry = ROOT / "apps" / "desktop" / "src" / "App.tsx"
    api_client = ROOT / "apps" / "desktop" / "src" / "shared" / "api" / "client.ts"
    shell = ROOT / "apps" / "desktop" / "src" / "app" / "AppShell.tsx"
    feature_registry = ROOT / "apps" / "desktop" / "src" / "app" / "featureRegistry.tsx"
    assert len(app_entry.read_text(encoding="utf-8").splitlines()) <= 350
    assert len(shell.read_text(encoding="utf-8").splitlines()) <= 350
    assert "/api/v1" in api_client.read_text(encoding="utf-8")
    assert feature_registry.exists()
    assert "renderFeaturePage" in feature_registry.read_text(encoding="utf-8")
    assert not (ROOT / "apps" / "desktop" / "src" / "app" / "navigation.ts").exists()
    assert "../features/" not in shell.read_text(encoding="utf-8")
    for path in (ROOT / "apps" / "desktop" / "src").rglob("*.tsx"):
        assert "fetch(" not in path.read_text(encoding="utf-8")


def test_frontend_features_have_local_api_modules():
    feature_root = ROOT / "apps" / "desktop" / "src" / "features"
    feature_registry = (ROOT / "apps" / "desktop" / "src" / "app" / "featureRegistry.tsx").read_text(encoding="utf-8")
    for feature in FRONTEND_FEATURES:
        feature_dir = feature_root / feature
        assert feature_dir.exists()
        assert (feature_dir / "api.ts").exists()
        assert any(feature_dir.glob("*Page.tsx"))
        assert f'id: "{feature}"' in feature_registry

    for page in feature_root.rglob("*Page.tsx"):
        text = page.read_text(encoding="utf-8")
        assert len(text.splitlines()) <= 450
        assert "../../shared/api/client" not in text
        assert "apiGet" not in text
        assert "apiPost" not in text
        assert "apiDelete" not in text
        assert "apiPostForm" not in text
        assert "apiGetBlob" not in text

    raw_api_markers = ("apiGet", "apiPost", "apiDelete", "apiPostForm", "apiGetBlob", "apiUrl")
    for component in feature_root.rglob("*.tsx"):
        text = component.read_text(encoding="utf-8")
        assert "../../shared/api/client" not in text
        assert not any(marker in text for marker in raw_api_markers)


def test_large_frontend_features_are_split_into_components():
    feature_root = ROOT / "apps" / "desktop" / "src" / "features"
    for feature in SPLIT_FRONTEND_FEATURES:
        feature_dir = feature_root / feature
        components_dir = feature_dir / "components"
        feature_name = feature.title().replace(" ", "")
        workspace = components_dir / f"{feature_name}Workspace.tsx"
        view = components_dir / f"{feature_name}View.tsx"
        if feature == "transactions":
            workspace = components_dir / "TransactionsWorkspace.tsx"
            view = components_dir / "TransactionsView.tsx"
        assert components_dir.exists()
        assert workspace.exists()
        assert view.exists()
        assert len(workspace.read_text(encoding="utf-8").splitlines()) <= 120
        assert len((feature_dir / f"{feature.title().replace(' ', '')}Page.tsx").read_text(encoding="utf-8").splitlines()) <= 80


def test_split_frontend_workspaces_delegate_to_feature_hooks():
    feature_root = ROOT / "apps" / "desktop" / "src" / "features"
    for feature in HOOKED_FRONTEND_FEATURES:
        feature_dir = feature_root / feature
        feature_name = feature.title().replace(" ", "")
        hooks_dir = feature_dir / "hooks"
        workspace = feature_dir / "components" / f"{feature_name}Workspace.tsx"
        hook = hooks_dir / f"use{feature_name}Workspace.tsx"
        assert hooks_dir.exists()
        assert workspace.exists()
        assert hook.exists()
        assert f"use{feature_name}Workspace" in workspace.read_text(encoding="utf-8")
        assert f"export function use{feature_name}Workspace" in hook.read_text(encoding="utf-8")


def test_frontend_workspace_hooks_stay_bounded():
    feature_root = ROOT / "apps" / "desktop" / "src" / "features"
    for feature in HOOKED_FRONTEND_FEATURES:
        feature_name = feature.title().replace(" ", "")
        hook = feature_root / feature / "hooks" / f"use{feature_name}Workspace.tsx"
        assert len(hook.read_text(encoding="utf-8").splitlines()) <= 900


def test_largest_frontend_views_are_split_into_sections():
    feature_root = ROOT / "apps" / "desktop" / "src" / "features"
    for feature in SECTIONED_FRONTEND_FEATURES:
        components_dir = feature_root / feature / "components"
        sections_dir = components_dir / "sections"
        view = components_dir / f"{feature.title().replace(' ', '')}View.tsx"
        assert sections_dir.exists()
        assert len(view.read_text(encoding="utf-8").splitlines()) <= 160
        assert len(list(sections_dir.glob("*.tsx"))) >= 4
        for section in sections_dir.glob("*.tsx"):
            assert len(section.read_text(encoding="utf-8").splitlines()) <= 650
