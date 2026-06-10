"""Compatibility shim for the feature-owned service module."""

from importlib import import_module
import sys

_module = import_module("backend.app.features.receivables.invoice_pdf")
sys.modules[__name__] = _module
