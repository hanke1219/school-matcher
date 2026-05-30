from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "data"
SRC_DATA_DIR = ROOT / "src" / "data"
sys.path.insert(0, str(ROOT))

from schools_data import SCHOOLS


TAG_TO_SCORE = {
    "英語教育": 5,
    "留学機会": 4,
    "国際化": 4,
    "中高一貫": 4,
    "大学附属": 3,
    "進学実績": 4,
    "探究学習": 4,
    "サイエンス": 3,
}


def tag_score(tags: list[str], preferred: tuple[str, ...], default: int = 3) -> int:
    score = default
    for tag in tags:
        if tag in preferred:
            score = max(score, TAG_TO_SCORE.get(tag, default))
    return score


def normalize_school(school: dict) -> dict:
    tags = school.get("tags", [])
    report_id = school.get("deep_report_id", "")
    return {
        "id": school["id"],
        "nameJa": school["name"],
        "nameZh": school["name"],
        "type": school["type"],
        "homepageUrl": school.get("homepage_url", ""),
        "photoUrl": school.get("photo_url", ""),
        "photoSourceUrl": school.get("photo_source_url", ""),
        "address": school.get("address", ""),
        "nearestStation": school.get("nearest_station", ""),
        "commuteMinutes": school.get("travel_time_from_koshigaya_laketown", 90),
        "hensachiAverage80": school.get("hensachi", 0),
        "hensachiBasis": school.get("hensachi_basis", ""),
        "description": school.get("description", school.get("notes", "")),
        "tags": tags,
        "aspirationCategory": "未分類",
        "scores": {
            "childPreference": 3,
            "englishEducation": tag_score(tags, ("英語教育", "国際化")),
            "pathway": tag_score(tags, ("留学機会", "大学附属", "進学実績")),
            "atmosphere": tag_score(tags, ("探究学習", "中高一貫")),
        },
        "lunch": {
            "hasCafeteria": None,
            "requiresBento": None,
            "satisfaction": None,
            "note": "未確認",
        },
        "pathways": {
            "hasStudyAbroadPath": "留学機会" in tags,
            "hasOverseasUniversityPath": "留学機会" in tags or "国際化" in tags,
            "domesticUniversitySupport": "strong" if "進学実績" in tags or "大学附属" in tags else "unknown",
            "note": "公開情報と家庭確認で更新",
        },
        "family": {
            "parentNote": "",
            "childFeedback": "",
        },
        "events": [
            {
                "name": event.get("name", ""),
                "date": event.get("date", ""),
                "reservationStart": event.get("reservation_start", ""),
                "eventType": event.get("event_type", ""),
                "timeSlot": event.get("time_slot", ""),
                "sourceUrl": event.get("source_url", ""),
                "checkStatus": event.get("check_status", ""),
                "note": event.get("note", ""),
            }
            for event in school.get("events", [])
        ],
        "examSessions": [
            {
                "id": session.get("id", ""),
                "name": session.get("name", ""),
                "examDate": session.get("exam_date", ""),
                "slot": session.get("slot", ""),
                "sapixGirls80": session.get("sapix_girls_80", session.get("hensachi", 0)),
                "sapixGirls50": session.get("sapix_girls_50", ""),
                "applicationStart": session.get("application_start", ""),
                "applicationEnd": session.get("application_end", ""),
                "resultDate": session.get("result_date", ""),
                "procedureDeadline": session.get("procedure_deadline", ""),
                "sourceUrl": session.get("source_url", ""),
                "checkStatus": session.get("check_status", ""),
                "note": session.get("note", ""),
            }
            for session in school.get("exam_sessions", [])
        ],
        "reportId": report_id,
        "notes": school.get("notes", ""),
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SRC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    schools = [normalize_school(school) for school in SCHOOLS]
    weights = {
        "childPreference": 25,
        "englishEducation": 20,
        "pathway": 20,
        "atmosphere": 15,
        "hensachi": 10,
        "commute": 10,
    }
    for data_dir in (OUT_DIR, SRC_DATA_DIR):
        (data_dir / "schools.json").write_text(json.dumps(schools, ensure_ascii=False, indent=2), encoding="utf-8")
        (data_dir / "weights.json").write_text(json.dumps(weights, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
