from dataclasses import dataclass

from fastapi import APIRouter


@dataclass(frozen=True)
class FeatureRoute:
    router: APIRouter
    versioned: bool = True
    stable_root: bool = False


@dataclass(frozen=True)
class FeatureManifest:
    key: str
    label: str
    dependencies: tuple[str, ...] = ()
    routes: tuple[FeatureRoute, ...] = ()
