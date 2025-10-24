# test_backend.py
# End-to-end smoke tests for the DeepKlarity backend (no external deps).
# Run: python -m unittest -v tests/est_backend.py
# Env overrides:
#   BASE_URL    (default: http://127.0.0.1:8000)
#   ARTICLE_URL (default: https://en.wikipedia.org/wiki/World_Wide_Web)

import json
import os
import sys
import time
import unittest
from urllib import request, parse, error


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8000").rstrip("/")
ARTICLE_URL = os.environ.get(
    "ARTICLE_URL",
    "https://en.wikipedia.org/wiki/World_Wide_Web",
)

# -------- tiny HTTP helpers (stdlib only) --------
def http_get(url: str, headers: dict | None = None):
    req = request.Request(url, headers=headers or {})
    try:
        with request.urlopen(req, timeout=60) as resp:
            status = resp.getcode()
            body = resp.read().decode("utf-8")
            ctype = resp.headers.get("content-type", "")
            return status, body, ctype
    except error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore"), e.headers.get("content-type", "")
    except Exception as e:
        raise AssertionError(f"GET {url} failed: {e}") from e


def http_post_json(url: str, payload: dict, headers: dict | None = None):
    data = json.dumps(payload).encode("utf-8")
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = request.Request(url, data=data, headers=hdrs, method="POST")
    try:
        with request.urlopen(req, timeout=120) as resp:
            status = resp.getcode()
            body = resp.read().decode("utf-8")
            ctype = resp.headers.get("content-type", "")
            return status, body, ctype
    except error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore"), e.headers.get("content-type", "")
    except Exception as e:
        raise AssertionError(f"POST {url} failed: {e}") from e


def parse_json(body: str):
    try:
        return json.loads(body)
    except json.JSONDecodeError as e:
        raise AssertionError(f"Response is not valid JSON:\n{body[:500]}...") from e


class BackendE2ETest(unittest.TestCase):
    """End-to-end happy path + a few negative checks."""

    # class-level state shared across tests
    quiz_id: int | None = None
    qcount: int | None = None
    generated_title: str | None = None

    @classmethod
    def setUpClass(cls):
        print(f"\n[setup] BASE_URL={BASE_URL}  ARTICLE_URL={ARTICLE_URL}")

    # --- 0) health ----------------------------------------
    def test_00_health(self):
        status, body, _ = http_get(f"{BASE_URL}/health")
        self.assertEqual(status, 200, msg=f"health status != 200: {status} body={body}")
        data = parse_json(body)
        self.assertIn("ok", data)
        self.assertEqual(data["ok"], "pong")

    # --- 1) generate quiz ---------------------------------
    def test_01_generate_quiz(self):
        status, body, _ = http_post_json(f"{BASE_URL}/generate_quiz", {"url": ARTICLE_URL})
        self.assertIn(status, (200, 201), msg=f"generate status {status} body={body}")
        data = parse_json(body)

        # required keys
        for k in ("id", "url", "title", "date_generated", "full_quiz_data"):
            self.assertIn(k, data, msg=f"missing key {k} in generate response")

        fq = data["full_quiz_data"]
        self.assertIn("quiz", fq)
        self.assertIsInstance(fq["quiz"], list)
        self.assertGreaterEqual(len(fq["quiz"]), 5)
        self.assertLessEqual(len(fq["quiz"]), 10)

        # store for later tests
        BackendE2ETest.quiz_id = int(data["id"])
        BackendE2ETest.generated_title = data.get("title", "")
        BackendE2ETest.qcount = len(fq["quiz"])

        print(f"[generate] id={self.quiz_id} title={self.generated_title} qcount={self.qcount}")

    # --- 2) get quiz by id --------------------------------
    def test_02_get_quiz(self):
        self.assertIsNotNone(self.quiz_id, "quiz_id missing from previous step")
        status, body, _ = http_get(f"{BASE_URL}/quiz/{self.quiz_id}")
        self.assertEqual(status, 200, msg=f"get quiz status {status} body={body}")
        data = parse_json(body)
        self.assertEqual(int(data["id"]), self.quiz_id)
        qlen = len(data["full_quiz_data"]["quiz"])
        self.assertEqual(qlen, self.qcount)

    # --- 3) history ---------------------------------------
    def test_03_history(self):
        status, body, _ = http_get(f"{BASE_URL}/history?page=1&page_size=10")
        self.assertEqual(status, 200, msg=f"history status {status} body={body}")
        data = parse_json(body)
        self.assertIn("items", data)
        self.assertIsInstance(data["items"], list)
        # recent id should be present
        ids = [it.get("id") for it in data["items"]]
        self.assertIn(self.quiz_id, ids)

    # --- 4) grade with bad count (negative) ----------------
    def test_04_grade_bad_count(self):
        self.assertIsNotNone(self.quiz_id)
        bad_answers = [0, 1, 2]  # intentionally wrong length
        status, body, _ = http_post_json(f"{BASE_URL}/grade", {"id": self.quiz_id, "answers": bad_answers})
        self.assertEqual(status, 400, msg=f"expected 400 on bad count, got {status} body={body}")
        data = parse_json(body)
        # FastAPI can return {"detail": "..."} for validation-ish errors
        self.assertIn("detail", data)
        self.assertIn("mismatch", data["detail"].lower())

    # --- 5) grade with full set of answers -----------------
    def test_05_grade_full(self):
        self.assertIsNotNone(self.quiz_id)
        self.assertIsNotNone(self.qcount)
        answers = [0] * self.qcount  # deterministic dummy attempt

        status, body, _ = http_post_json(f"{BASE_URL}/grade", {"id": self.quiz_id, "answers": answers})
        self.assertEqual(status, 200, msg=f"grade status {status} body={body}")
        data = parse_json(body)

        for k in ("id", "total", "correct", "score", "results"):
            self.assertIn(k, data, msg=f"missing key {k} in grade response")

        self.assertEqual(int(data["id"]), self.quiz_id)
        self.assertEqual(int(data["total"]), self.qcount)
        self.assertIsInstance(data["results"], list)
        self.assertEqual(len(data["results"]), self.qcount)

        first = data["results"][0]
        for k in ("index", "chosen", "correct", "is_correct", "explanation", "evidence_span"):
            self.assertIn(k, first, msg=f"missing per-question field {k}")

        print(f"[grade] score={data['score']} correct={data['correct']}/{data['total']}")

    # --- 6) quiz not found (negative) ----------------------
    def test_06_quiz_not_found(self):
        bogus_id = 999_999_999
        status, body, _ = http_get(f"{BASE_URL}/quiz/{bogus_id}")
        self.assertEqual(status, 404, msg=f"expected 404 for unknown id, got {status} body={body}")
        data = parse_json(body)
        self.assertIn("detail", data)
        self.assertIn("not found", data["detail"].lower())


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(BackendE2ETest)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
