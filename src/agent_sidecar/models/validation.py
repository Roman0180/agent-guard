from __future__ import annotations

import json
import re
from collections.abc import Iterable
from typing import Any, get_args, get_origin

from pydantic import BaseModel, ValidationError


def extract_json_object(text: str) -> dict[str, Any] | None:
    for parsed in iter_json_objects(text):
        return parsed
    return None


def validate_json_text(text: str, schema: type[BaseModel]) -> BaseModel | None:
    for parsed in iter_json_objects(text):
        try:
            return schema.model_validate(_coerce_list_strings(parsed, schema))
        except ValidationError:
            continue
    return None


def iter_json_objects(text: str) -> Iterable[dict[str, Any]]:
    stripped = text.strip()
    seen: set[tuple[int, int]] = set()
    decoder = json.JSONDecoder()

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        pass
    else:
        if isinstance(parsed, dict):
            yield parsed
            seen.add((0, len(stripped)))

    for match in re.finditer(r"\{", stripped):
        start = match.start()
        try:
            parsed, end = decoder.raw_decode(stripped[start:])
        except json.JSONDecodeError:
            continue
        span = (start, start + end)
        if span in seen:
            continue
        if isinstance(parsed, dict):
            yield parsed
            seen.add(span)


def _coerce_list_strings(parsed: dict[str, Any], schema: type[BaseModel]) -> dict[str, Any]:
    normalized = dict(parsed)
    for name, field in schema.model_fields.items():
        value = normalized.get(name)
        if isinstance(value, str) and get_origin(field.annotation) is list and get_args(field.annotation) == (str,):
            normalized[name] = [value]
        elif isinstance(value, list) and field.annotation is str:
            normalized[name] = "\n".join(str(item) for item in value if isinstance(item, str))
    return normalized


def is_material_restatement(original: str, refined: str) -> bool:
    original_words = _words(original)
    refined_words = _words(refined)
    if not original_words or not refined_words:
        return True
    overlap = len(original_words & refined_words) / max(1, len(original_words | refined_words))
    length_ratio = len(refined.strip()) / max(1, len(original.strip()))
    return overlap > 0.85 and length_ratio < 1.35


def evidence_subset(candidate_ids: list[str], allowed_ids: set[str]) -> bool:
    return all(event_id in allowed_ids for event_id in candidate_ids)


def _words(text: str) -> set[str]:
    return {word.lower() for word in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", text)}
