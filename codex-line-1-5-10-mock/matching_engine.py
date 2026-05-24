from __future__ import annotations

from copy import deepcopy
from typing import Any


KNOWN_ADDRESS_ADJUSTMENTS = [
    ("越谷レイクタウン", 0),
    ("越谷", 5),
    ("草加", 8),
    ("三郷", 10),
    ("春日部", 15),
    ("さいたま", 12),
    ("浦和", 16),
    ("大宮", 20),
    ("北千住", -8),
    ("上野", -12),
    ("東京", -10),
    ("新宿", 8),
    ("池袋", 0),
    ("千葉", -5),
]


def estimate_commute_time(home_address: str, school: dict[str, Any]) -> int:
    """Return a mocked door-to-door train time in minutes."""
    base_time = int(school["travel_time_from_koshigaya_laketown"])
    normalized = (home_address or "").strip()

    adjustment = 0
    for keyword, minutes in KNOWN_ADDRESS_ADJUSTMENTS:
        if keyword in normalized:
            adjustment = minutes
            break

    return max(15, base_time + adjustment)


def score_hensachi(student_hensachi: int | float, school_hensachi: int | float) -> tuple[float, list[str]]:
    gap = float(school_hensachi) - float(student_hensachi)
    reasons: list[str] = []

    if -5 <= gap <= 3:
        score = 30
        reasons.append(f"偏差値差 {gap:+.0f}，处在最适合冲刺区间，加满 30 分")
    elif gap > 3:
        score = max(0, 30 - (gap - 3) * 4)
        reasons.append(f"学校偏差值高出 {gap:.0f}，按梯度扣分")
    else:
        score = max(10, 30 - (abs(gap) - 5) * 2)
        reasons.append(f"孩子偏差值明显高于学校 {abs(gap):.0f}，作为保底校略扣分")

    return round(score, 1), reasons


def score_commute(commute_minutes: int) -> tuple[float, list[str]]:
    reasons: list[str] = []

    if commute_minutes <= 30:
        score = 25
        reasons.append("通勤 30 分钟内，通勤项加满 25 分")
    elif commute_minutes <= 90:
        penalty = ((commute_minutes - 30) / 5) * 2
        score = max(5, 25 - penalty)
        reasons.append(f"通勤约 {commute_minutes} 分钟，超过 30 分钟后每 5 分钟扣 2 分")
    else:
        score = 2
        reasons.append(f"通勤约 {commute_minutes} 分钟，超过 90 分钟，通勤项大幅扣分")

    return round(score, 1), reasons


def score_tags(student_tags: list[str], school_tags: list[str]) -> tuple[float, list[str], list[str]]:
    selected = set(student_tags or [])
    school_tag_set = set(school_tags or [])
    matched = sorted(selected & school_tag_set)
    score = min(30, len(matched) * 20)
    reasons = [f"完美匹配「{tag}」需求，加 20 分" for tag in matched]

    if selected and not matched:
        reasons.append("核心需求标签暂未重合，标签项不加分")
    elif len(matched) >= 2:
        reasons.append("多项核心需求重合，标签项达到上限 30 分")

    return score, reasons, matched


def score_school_type(expected_type: str, school_type: str) -> tuple[float, list[str]]:
    if not expected_type or expected_type == "不限":
        return 10, ["学校类型不限，类型项默认加 10 分"]
    if expected_type == school_type:
        return 10, [f"学校类型符合「{expected_type}」，加 10 分"]
    return 0, [f"期望「{expected_type}」，该校为「{school_type}」，类型项不加分"]


def calculate_matching_score(student: dict[str, Any], school: dict[str, Any]) -> dict[str, Any]:
    """Calculate a 0-100 matching score for one student and one school.

    Student shape:
        {
            "hensachi": 62,
            "home_address": "越谷レイクタウン",
            "tags": ["国際化", "英語教育"],
            "expected_type": "共学"
        }
    """
    student_hensachi = float(student.get("hensachi") or 0)
    commute_minutes = estimate_commute_time(student.get("home_address", ""), school)

    hensachi_score, hensachi_reasons = score_hensachi(student_hensachi, school["hensachi"])
    commute_score, commute_reasons = score_commute(commute_minutes)
    tag_score, tag_reasons, matched_tags = score_tags(student.get("tags", []), school.get("tags", []))
    type_score, type_reasons = score_school_type(student.get("expected_type", "不限"), school["type"])

    total = min(100, round(hensachi_score + commute_score + tag_score + type_score, 1))

    return {
        "school": deepcopy(school),
        "score": total,
        "breakdown": {
            "hensachi": hensachi_score,
            "commute": commute_score,
            "tags": tag_score,
            "type": type_score,
        },
        "commute_minutes": commute_minutes,
        "matched_tags": matched_tags,
        "reasons": hensachi_reasons + commute_reasons + tag_reasons + type_reasons,
    }


def school_matches_filters(student: dict[str, Any], school: dict[str, Any]) -> bool:
    selected_tags = set(student.get("tags", []))
    school_tags = set(school.get("tags", []))
    expected_type = student.get("expected_type", "不限")
    selected_exam_dates = set(student.get("exam_dates", []))

    if expected_type and expected_type != "不限" and school["type"] != expected_type:
        return False

    if selected_tags and not selected_tags.intersection(school_tags):
        return False

    if selected_exam_dates:
        school_dates = {session.get("exam_date") for session in school.get("exam_sessions", [])}
        if not selected_exam_dates.intersection(school_dates):
            return False

    return True


def rank_schools(student: dict[str, Any], schools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered_schools = [school for school in schools if school_matches_filters(student, school)]
    results = [calculate_matching_score(student, school) for school in filtered_schools]
    return sorted(
        results,
        key=lambda item: (item["score"], item["school"]["hensachi"]),
        reverse=True,
    )
