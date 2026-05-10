from __future__ import annotations

import json
import re
from typing import Any

import requests
from sqlalchemy.orm import Session

from ..config import LOCAL_AI_API_KEY
from .settings import get_local_ai_settings


class LocalAIError(RuntimeError):
    pass


class LocalAIUnavailableError(LocalAIError):
    pass


def local_ai_status(session: Session) -> dict[str, Any]:
    settings = get_local_ai_settings(session)
    return {
        "enabled": bool(settings["enabled"]),
        "configured": bool(settings["configured"]),
        "base_url": settings["base_url"],
        "model": settings["model"],
        "timeout_seconds": settings["timeout_seconds"],
        "embedding_model": settings["embedding_model"],
    }


def _extract_json_object(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise LocalAIError("Local AI response did not contain a JSON object.")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise LocalAIError("Local AI returned invalid JSON.") from exc
    if not isinstance(parsed, dict):
        raise LocalAIError("Local AI response must be a JSON object.")
    return parsed


def call_local_json(
    session: Session,
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 400,
) -> dict[str, Any]:
    settings = local_ai_status(session)
    if not settings["enabled"]:
        raise LocalAIUnavailableError("Local AI is disabled.")
    if not settings["configured"]:
        raise LocalAIUnavailableError("Local AI is not configured.")

    headers = {"Content-Type": "application/json"}
    if LOCAL_AI_API_KEY:
        headers["Authorization"] = f"Bearer {LOCAL_AI_API_KEY}"

    payload = {
        "model": settings["model"],
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    try:
        response = requests.post(
            f"{str(settings['base_url']).rstrip('/')}/chat/completions",
            json=payload,
            headers=headers,
            timeout=int(settings["timeout_seconds"]),
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise LocalAIUnavailableError(f"Local AI request failed: {exc}") from exc

    data = response.json()
    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    if not isinstance(content, str) or not content.strip():
        raise LocalAIError("Local AI returned an empty completion.")
    return _extract_json_object(content)
