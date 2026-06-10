from pathlib import Path

from backend.app.models import Account, Base
from backend.app.features.ledger.models import Account as FeatureAccount
from backend.app.schemas import InvoiceCreate
from backend.app.features.receivables.schemas import InvoiceCreate as FeatureInvoiceCreate
from backend.app.main import app


ROOT = Path(__file__).resolve().parents[2]


def test_feature_packages_have_standard_entrypoints():
    feature_root = ROOT / "backend" / "app" / "features"
    packages = [
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
    ]
    for package in packages:
        package_dir = feature_root / package
        assert (package_dir / "__init__.py").exists()
        assert (package_dir / "router.py").exists()
        assert (package_dir / "service.py").exists()


def test_versioned_api_and_stable_readiness_routes_are_registered():
    paths = {route.path for route in app.routes}
    assert "/health" in paths
    assert "/diagnostics/status" in paths
    assert "/api/v1/transactions/details" in paths
    assert "/api/v1/receivables/reconcile" in paths


def test_feature_routers_do_not_import_legacy_api_modules():
    feature_root = ROOT / "backend" / "app" / "features"
    offenders: list[str] = []
    for path in feature_root.rglob("*router.py"):
        text = path.read_text(encoding="utf-8")
        if "backend.app.api" in text or ".api" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_legacy_api_modules_are_shims_only():
    api_root = ROOT / "backend" / "app" / "api"
    offenders: list[str] = []
    for path in api_root.glob("*.py"):
        if path.name == "__init__.py":
            continue
        text = path.read_text(encoding="utf-8")
        if "Compatibility shim" not in text or "import_module" not in text or len(text.splitlines()) > 10:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_app_composition_uses_feature_entrypoints():
    main_text = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
    assert ".api" not in main_text
    assert ".services" not in main_text


def test_feature_code_does_not_import_legacy_services():
    offenders: list[str] = []
    for path in (ROOT / "backend" / "app" / "features").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "backend.app.services" in text or "...services" in text or "..services" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_legacy_service_modules_are_shims_only():
    services_root = ROOT / "backend" / "app" / "services"
    offenders: list[str] = []
    for path in services_root.glob("*.py"):
        if path.name == "__init__.py":
            continue
        text = path.read_text(encoding="utf-8")
        if "Compatibility shim" not in text or "import_module" not in text or len(text.splitlines()) > 10:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_models_and_schemas_are_feature_owned():
    feature_root = ROOT / "backend" / "app" / "features"
    offenders: list[str] = []
    for path in feature_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "...models" in text or "...schemas" in text or "backend.app.models" in text or "backend.app.schemas" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []

    assert Account is FeatureAccount
    assert InvoiceCreate is FeatureInvoiceCreate
    assert {"account", "transactions", "invoice", "app_setting"} <= set(Base.metadata.tables)


def test_root_model_and_schema_modules_are_reexports_only():
    for relative_path in ["backend/app/models.py", "backend/app/schemas.py"]:
        text = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "class " not in text
        assert "Compatibility re-export layer" in text


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
    assert offenders == []


def test_scripts_do_not_import_private_api_modules():
    offenders: list[str] = []
    for script_root in [ROOT / "scripts", ROOT / "backend" / "scripts"]:
        if not script_root.exists():
            continue
        for path in script_root.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if (
                "backend.app.api" in text
                or "backend.app.services" in text
                or "backend.app.models" in text
                or "backend.app.schemas" in text
            ):
                offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_frontend_entry_and_api_client_are_decoupled():
    app_entry = ROOT / "apps" / "desktop" / "src" / "App.tsx"
    api_client = ROOT / "apps" / "desktop" / "src" / "shared" / "api" / "client.ts"
    shell = ROOT / "apps" / "desktop" / "src" / "app" / "AppShell.tsx"
    assert len(app_entry.read_text(encoding="utf-8").splitlines()) <= 350
    assert len(shell.read_text(encoding="utf-8").splitlines()) <= 350
    assert "/api/v1" in api_client.read_text(encoding="utf-8")
    for path in (ROOT / "apps" / "desktop" / "src").rglob("*.tsx"):
        assert "fetch(" not in path.read_text(encoding="utf-8")


def test_frontend_features_have_local_api_modules():
    feature_root = ROOT / "apps" / "desktop" / "src" / "features"
    expected_features = {
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
    for feature in expected_features:
        feature_dir = feature_root / feature
        assert feature_dir.exists()
        assert (feature_dir / "api.ts").exists()
        assert list(feature_dir.glob("*Page.tsx"))

    for page in feature_root.rglob("*Page.tsx"):
        text = page.read_text(encoding="utf-8")
        assert "../../shared/api/client" not in text
