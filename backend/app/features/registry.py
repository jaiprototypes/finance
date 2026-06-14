from collections.abc import Iterable

from fastapi import APIRouter

from .assistant.manifest import manifest as assistant
from .budgeting.manifest import manifest as budgeting
from .classification.manifest import manifest as classification
from .connectors.manifest import manifest as connectors
from .debts.manifest import manifest as debts
from .demo.manifest import manifest as demo
from .diagnostics.manifest import manifest as diagnostics
from .fx.manifest import manifest as fx
from .imports.manifest import manifest as imports
from .ledger.manifest import manifest as ledger
from .manifest import FeatureManifest
from .planning.manifest import manifest as planning
from .receivables.manifest import manifest as receivables
from .reports.manifest import manifest as reports
from .settings.manifest import manifest as settings
from .taxonomy.manifest import manifest as taxonomy
from .timesheets.manifest import manifest as timesheets


FEATURE_MANIFESTS = (
    diagnostics,
    ledger,
    taxonomy,
    budgeting,
    debts,
    fx,
    planning,
    receivables,
    timesheets,
    imports,
    settings,
    demo,
    connectors,
    reports,
    classification,
    assistant,
)


class FeatureRegistry:
    def __init__(self, manifests: Iterable[FeatureManifest]):
        self._manifests = tuple(manifests)
        self._by_key = {manifest.key: manifest for manifest in self._manifests}
        self._validate_keys()
        self._validate_dependencies()

    @property
    def manifests(self) -> tuple[FeatureManifest, ...]:
        return self._manifests

    @property
    def keys(self) -> tuple[str, ...]:
        return tuple(manifest.key for manifest in self._manifests)

    def versioned_routers(self) -> tuple[APIRouter, ...]:
        return tuple(
            route.router
            for manifest in self._manifests
            for route in manifest.routes
            if route.versioned
        )

    def stable_root_routers(self) -> tuple[APIRouter, ...]:
        return tuple(
            route.router
            for manifest in self._manifests
            for route in manifest.routes
            if route.stable_root
        )

    def _validate_keys(self) -> None:
        if len(self._by_key) != len(self._manifests):
            raise ValueError("Feature manifests must use unique keys")

    def _validate_dependencies(self) -> None:
        for manifest in self._manifests:
            missing = sorted(set(manifest.dependencies) - set(self._by_key))
            if missing:
                joined = ", ".join(missing)
                raise ValueError(f"{manifest.key} has unknown feature dependencies: {joined}")
            if manifest.key in manifest.dependencies:
                raise ValueError(f"{manifest.key} cannot depend on itself")


registry = FeatureRegistry(FEATURE_MANIFESTS)
