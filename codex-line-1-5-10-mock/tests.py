import unittest

from matching_engine import calculate_matching_score
from matching_engine import rank_schools
from refresh_engine import collect_pending_exam_sources
from refresh_engine import collect_sources
from refresh_engine import find_pending_exam_fields
from refresh_engine import find_pending_fields
from schedule_engine import find_schedule_conflicts
from schools_data import SCHOOLS


class MatchingEngineTest(unittest.TestCase):
    def test_matching_score_returns_expected_shape(self):
        student = {
            "hensachi": 64,
            "home_address": "越谷レイクタウン",
            "tags": ["国際化", "英語教育", "中高一貫"],
            "expected_type": "共学",
        }

        result = calculate_matching_score(student, SCHOOLS[0])

        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)
        self.assertIn("hensachi", result["breakdown"])
        self.assertTrue(result["reasons"])

    def test_rank_schools_applies_type_and_tag_filters(self):
        student = {
            "hensachi": 60,
            "home_address": "越谷レイクタウン",
            "tags": ["大学附属"],
            "expected_type": "共学",
        }

        results = rank_schools(student, SCHOOLS)

        self.assertGreaterEqual(len(results), 1)
        self.assertTrue(all("大学附属" in result["school"]["tags"] for result in results))

    def test_schedule_conflict_detection(self):
        sessions = [
            {"school_name": "A", "exam_date": "2027-02-01", "slot": "AM", "name": "第1回"},
            {"school_name": "B", "exam_date": "2027-02-01", "slot": "AM", "name": "第1回"},
            {"school_name": "C", "exam_date": "2027-02-01", "slot": "PM", "name": "第1回"},
        ]

        conflicts = find_schedule_conflicts(sessions)

        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["exam_date"], "2027-02-01")

    def test_rank_schools_applies_exam_date_filter(self):
        student = {
            "hensachi": 58,
            "home_address": "越谷レイクタウン",
            "tags": ["国際化"],
            "expected_type": "共学",
            "exam_dates": ["2027-01-10"],
        }

        results = rank_schools(student, SCHOOLS)

        self.assertGreaterEqual(len(results), 1)
        self.assertTrue(
            all(
                any(session["exam_date"] == "2027-01-10" for session in result["school"]["exam_sessions"])
                for result in results
            )
        )

    def test_refresh_source_collection_deduplicates_school_urls(self):
        sources = collect_sources(SCHOOLS)
        school_url_pairs = [(source["school_id"], source["url"]) for source in sources]

        self.assertEqual(len(school_url_pairs), len(set(school_url_pairs)))
        self.assertTrue(any(source["source_type"] for source in sources))

    def test_refresh_pending_fields_are_detected(self):
        pending = find_pending_fields(SCHOOLS)

        self.assertGreater(len(pending), 0)
        self.assertTrue(any("未定" in item["value"] or "要再確認" in item["value"] for item in pending))

    def test_refresh_report_focuses_on_pending_exam_sources(self):
        sources = collect_pending_exam_sources(SCHOOLS)
        pending = find_pending_exam_fields(SCHOOLS)

        self.assertGreater(len(sources), 0)
        self.assertGreater(len(pending), 0)
        self.assertTrue(all(source["source_type"] == "入試日程" for source in sources))
        self.assertTrue(
            all(
                "出願" in item["path"]
                or "確認状態" in item["path"]
                or "メモ" in item["path"]
                or "試験日" in item["path"]
                or "合格発表" in item["path"]
                or "手続締切" in item["path"]
                for item in pending
            )
        )

    def test_school_hensachi_uses_average_of_exam_80_percent_values(self):
        for school in SCHOOLS:
            values = [session["sapix_girls_80"] for session in school["exam_sessions"]]
            expected = round(sum(values) / len(values), 1)

            self.assertEqual(float(school["hensachi"]), expected)
            self.assertEqual(school["hensachi_basis"], "SAPIX女子80% 回次平均")

    def test_exam_sessions_include_calendar_deadline_fields(self):
        for school in SCHOOLS:
            for session in school["exam_sessions"]:
                self.assertIn("result_date", session)
                self.assertIn("procedure_deadline", session)


if __name__ == "__main__":
    unittest.main()
