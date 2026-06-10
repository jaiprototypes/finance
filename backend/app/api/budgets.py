"""Compatibility shim for the feature-owned router module."""

from importlib import import_module
import sys

_module = import_module("backend.app.features.budgeting.router")
sys.modules[__name__] = _module
