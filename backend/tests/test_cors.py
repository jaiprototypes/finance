import re

from backend.app.main import LOCAL_WEB_ORIGIN_REGEX, TAURI_ALLOWED_ORIGINS


def test_local_web_origin_regex_allows_loopback_dev_ports():
    pattern = re.compile(LOCAL_WEB_ORIGIN_REGEX)

    assert pattern.match("http://localhost:5173")
    assert pattern.match("http://localhost:5174")
    assert pattern.match("http://127.0.0.1:1420")
    assert pattern.match("https://localhost:3000")


def test_local_web_origin_regex_rejects_non_loopback_origins():
    pattern = re.compile(LOCAL_WEB_ORIGIN_REGEX)

    assert not pattern.match("https://example.com")
    assert not pattern.match("http://192.168.1.10:5173")


def test_tauri_origins_remain_allowed():
    assert "tauri://localhost" in TAURI_ALLOWED_ORIGINS
    assert "https://tauri.localhost" in TAURI_ALLOWED_ORIGINS
