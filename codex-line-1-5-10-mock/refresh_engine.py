from __future__ import annotations

import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
CACHE_PATH = Path(os.environ.get("REFRESH_CACHE_PATH", ROOT / "refresh_cache.json"))
FETCH_TIMEOUT_SECONDS = 5
READ_LIMIT_BYTES = 250_000
MAX_WORKERS = 8

PENDING_MARKERS = ("未定", "要再確認", "要校対", "候補")
KEYWORDS = ("2027年度", "2026年度", "募集要項", "入試日程", "入試要項", "出願", "試験日", "入学試験")
MANUAL_REVIEW_TYPES = ("application/pdf", "image/")


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_cache(cache_path: Path = CACHE_PATH) -> dict[str, Any]:
    if not cache_path.exists():
        return {}
    try:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_cache(cache: dict[str, Any], cache_path: Path = CACHE_PATH) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def extract_title(text: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    title = re.sub(r"\s+", " ", match.group(1))
    return title.strip()[:120]


def decode_preview(content: bytes, content_type: str) -> str:
    if "text" not in content_type and "html" not in content_type and "json" not in content_type:
        return ""
    for encoding in ("utf-8", "cp932", "shift_jis", "euc_jp"):
        try:
            return content.decode(encoding, errors="ignore")
        except LookupError:
            continue
    return content.decode("utf-8", errors="ignore")


def is_manual_review_source(url: str, content_type: str) -> bool:
    lowered_url = url.lower()
    return lowered_url.endswith(".pdf") or any(content_type.startswith(prefix) for prefix in MANUAL_REVIEW_TYPES)


def collect_sources(schools: list[dict[str, Any]]) -> list[dict[str, str]]:
    sources: dict[tuple[str, str], dict[str, str]] = {}

    def add_source(school: dict[str, Any], source_type: str, url: str | None) -> None:
        if not url:
            return
        key = (school["id"], url)
        if key not in sources:
            sources[key] = {
                "school_id": school["id"],
                "school_name": school["name"],
                "source_type": source_type,
                "url": url,
            }
            return
        if source_type not in sources[key]["source_type"].split(" / "):
            sources[key]["source_type"] = f'{sources[key]["source_type"]} / {source_type}'

    for school in schools:
        add_source(school, "学校官网", school.get("homepage_url"))
        add_source(school, "写真来源", school.get("photo_source_url"))
        for event in school.get("events", []):
            add_source(school, "説明会・イベント", event.get("source_url"))
        for session in school.get("exam_sessions", []):
            add_source(school, "入試要項", session.get("source_url"))

    return sorted(sources.values(), key=lambda item: (item["school_name"], item["url"]))


def school_has_pending_exam_info(school: dict[str, Any]) -> bool:
    for session in school.get("exam_sessions", []):
        values = (
            session.get("exam_date"),
            session.get("application_start"),
            session.get("application_end"),
            session.get("result_date"),
            session.get("procedure_deadline"),
            session.get("check_status"),
            session.get("note"),
        )
        if any(has_pending_marker(value) for value in values):
            return True
    return False


def collect_pending_exam_sources(schools: list[dict[str, Any]]) -> list[dict[str, str]]:
    sources: dict[tuple[str, str], dict[str, str]] = {}

    for school in schools:
        if not school_has_pending_exam_info(school):
            continue
        for session in school.get("exam_sessions", []):
            url = session.get("source_url")
            if not url:
                continue
            key = (school["id"], url)
            sources[key] = {
                "school_id": school["id"],
                "school_name": school["name"],
                "source_type": "入試日程",
                "url": url,
            }

    return sorted(sources.values(), key=lambda item: (item["school_name"], item["url"]))


def has_pending_marker(value: Any) -> bool:
    if value is None:
        return False
    text = str(value)
    return any(marker in text for marker in PENDING_MARKERS)


def find_pending_fields(schools: list[dict[str, Any]]) -> list[dict[str, str]]:
    pending: list[dict[str, str]] = []

    def add(school: dict[str, Any], path: str, value: Any, source_url: str = "") -> None:
        if has_pending_marker(value):
            pending.append(
                {
                    "school_name": school["name"],
                    "path": path,
                    "value": str(value),
                    "source_url": source_url,
                }
            )

    for school in schools:
        add(school, "hensachi_basis", school.get("hensachi_basis"))
        add(school, "notes", school.get("notes"))
        for index, event in enumerate(school.get("events", []), start=1):
            prefix = f"events[{index}] {event.get('name', '')}"
            add(school, f"{prefix}.reservation_start", event.get("reservation_start"), event.get("source_url", ""))
            add(school, f"{prefix}.check_status", event.get("check_status"), event.get("source_url", ""))
            add(school, f"{prefix}.note", event.get("note"), event.get("source_url", ""))
        for index, session in enumerate(school.get("exam_sessions", []), start=1):
            prefix = f"exam_sessions[{index}] {session.get('name', '')}"
            add(school, f"{prefix}.application_start", session.get("application_start"), session.get("source_url", ""))
            add(school, f"{prefix}.application_end", session.get("application_end"), session.get("source_url", ""))
            add(school, f"{prefix}.check_status", session.get("check_status"), session.get("source_url", ""))
            add(school, f"{prefix}.note", session.get("note"), session.get("source_url", ""))

    return pending


def find_pending_exam_fields(schools: list[dict[str, Any]]) -> list[dict[str, str]]:
    pending: list[dict[str, str]] = []

    def add(school: dict[str, Any], path: str, value: Any, source_url: str = "") -> None:
        if has_pending_marker(value):
            pending.append(
                {
                    "school_name": school["name"],
                    "path": path,
                    "value": str(value),
                    "source_url": source_url,
                }
            )

    for school in schools:
        for index, session in enumerate(school.get("exam_sessions", []), start=1):
            prefix = f"{session.get('name', f'入試{index}')}"
            add(school, f"{prefix}｜試験日", session.get("exam_date"), session.get("source_url", ""))
            add(school, f"{prefix}｜出願開始", session.get("application_start"), session.get("source_url", ""))
            add(school, f"{prefix}｜出願締切", session.get("application_end"), session.get("source_url", ""))
            add(school, f"{prefix}｜合格発表", session.get("result_date"), session.get("source_url", ""))
            add(school, f"{prefix}｜手続締切", session.get("procedure_deadline"), session.get("source_url", ""))
            add(school, f"{prefix}｜確認状態", session.get("check_status"), session.get("source_url", ""))
            add(school, f"{prefix}｜メモ", session.get("note"), session.get("source_url", ""))

    return pending


def fetch_source(source: dict[str, str], cache: dict[str, Any], checked_at: str) -> tuple[dict[str, Any], dict[str, Any]]:
    url = source["url"]
    previous = cache.get(url)
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 school-refresh-checker/1.0"})

    try:
        with urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            content = response.read(READ_LIMIT_BYTES)
            content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
            digest = content_hash(content)
            preview = decode_preview(content, content_type)
            keywords = [keyword for keyword in KEYWORDS if keyword in preview]
            changed = bool(previous and previous.get("hash") != digest)
            manual_review = is_manual_review_source(url, content_type)

            item = {
                **source,
                "status": "疑似更新" if changed else ("首次记录" if not previous else "无变化"),
                "ok": True,
                "changed": changed,
                "http_status": getattr(response, "status", 200),
                "content_type": content_type or "unknown",
                "title": extract_title(preview),
                "keywords": keywords,
                "manual_review": manual_review,
                "previous_checked_at": previous.get("checked_at", "") if previous else "",
                "error": "",
            }
            cache_entry = {
                "hash": digest,
                "checked_at": checked_at,
                "content_type": item["content_type"],
                "title": item["title"],
            }
            return item, cache_entry
    except HTTPError as exc:
        return {
            **source,
            "status": "访问失败",
            "ok": False,
            "changed": False,
            "http_status": exc.code,
            "content_type": "",
            "title": "",
            "keywords": [],
            "manual_review": url.lower().endswith(".pdf"),
            "previous_checked_at": previous.get("checked_at", "") if previous else "",
            "error": str(exc),
        }, previous or {}
    except (URLError, TimeoutError, OSError) as exc:
        return {
            **source,
            "status": "访问失败",
            "ok": False,
            "changed": False,
            "http_status": "",
            "content_type": "",
            "title": "",
            "keywords": [],
            "manual_review": url.lower().endswith(".pdf"),
            "previous_checked_at": previous.get("checked_at", "") if previous else "",
            "error": str(exc),
        }, previous or {}


def build_refresh_report(schools: list[dict[str, Any]], cache_path: Path = CACHE_PATH) -> dict[str, Any]:
    checked_at = now_iso()
    cache = load_cache(cache_path)
    sources = collect_pending_exam_sources(schools)
    pending_fields = find_pending_exam_fields(schools)
    items: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(fetch_source, source, cache, checked_at): source for source in sources}
        for future in as_completed(future_map):
            source = future_map[future]
            try:
                item, cache_entry = future.result()
            except Exception as exc:
                previous = cache.get(source["url"], {})
                item = {
                    **source,
                    "status": "访问失败",
                    "ok": False,
                    "changed": False,
                    "http_status": "",
                    "content_type": "",
                    "title": "",
                    "keywords": [],
                    "manual_review": source["url"].lower().endswith(".pdf"),
                    "previous_checked_at": previous.get("checked_at", ""),
                    "error": str(exc),
                }
                cache_entry = previous
            items.append(item)
            if cache_entry:
                cache[source["url"]] = cache_entry

    save_cache(cache, cache_path)
    items.sort(key=lambda item: (item["school_name"], item["url"]))
    visible_items = [item for item in items if item["changed"]]

    changed_count = len(visible_items)
    unavailable_count = sum(1 for item in items if not item["ok"])
    manual_count = sum(1 for item in items if item["manual_review"])

    return {
        "checked_at": checked_at,
        "school_count": len(schools),
        "source_count": len(sources),
        "changed_count": changed_count,
        "unavailable_count": unavailable_count,
        "manual_count": manual_count,
        "pending_field_count": len(pending_fields),
        "items": visible_items,
        "pending_fields": [],
        "note": "只显示有变化的入試日程来源，不自动修改数据库。",
    }
