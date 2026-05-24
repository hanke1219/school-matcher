from __future__ import annotations

from typing import Any


def sessions_conflict(left: dict[str, Any], right: dict[str, Any]) -> bool:
    if left["exam_date"] != right["exam_date"]:
        return False

    return left["slot"] == right["slot"] or "FULL" in {left["slot"], right["slot"]}


def find_schedule_conflicts(selected_sessions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    conflicts: list[dict[str, Any]] = []
    for left_index, left in enumerate(selected_sessions):
        for right in selected_sessions[left_index + 1 :]:
            if sessions_conflict(left, right):
                conflicts.append(
                    {
                        "exam_date": left["exam_date"],
                        "slot": "FULL" if "FULL" in {left["slot"], right["slot"]} else left["slot"],
                        "sessions": [left, right],
                    }
                )
    return conflicts
