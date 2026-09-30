"""Prohori (MFS fraud guard) backend API tests.
Covers: stats, transactions, simulate-sms, confirm, number-check, reports,
high-risk, extract text/image (LLM fallback), complaints (pool + community),
reset-demo, tts (expected 502), transcribe (expected 400/502).
"""
import os
import io
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
# Fallback to frontend .env parsing when running locally
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def reset(s):
    # Start every test module with fresh seeded data
    r = s.post(f"{API}/reset-demo", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- basics
def test_root(s, reset):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json()["message"] == "Prohori API"


def test_stats_shape(s, reset):
    r = s.get(f"{API}/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ["monitored", "alerts", "reports_pool", "high_risk_wallets", "complaints"]:
        assert k in d
    assert d["monitored"] >= 6
    assert d["high_risk_wallets"] >= 3
    assert d["complaints"] == 0


# ---------------------------------------------------------------- transactions
def test_list_transactions(s, reset):
    r = s.get(f"{API}/transactions")
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list) and len(lst) >= 6
    first = lst[0]
    for k in ["id", "provider", "type", "amount", "counterparty", "trx_id", "time", "balance"]:
        assert k in first
    # no leaked mongo _id
    assert "_id" not in first


def test_get_transaction_by_id(s, reset):
    lst = s.get(f"{API}/transactions").json()
    tid = lst[0]["id"]
    r = s.get(f"{API}/transactions/{tid}")
    assert r.status_code == 200
    assert r.json()["id"] == tid


def test_get_transaction_bad_id(s):
    r = s.get(f"{API}/transactions/not-a-real-id")
    assert r.status_code == 404


# ---------------------------------------------------------------- simulate + confirm
def test_simulate_sms_and_confirm(s, reset):
    r = s.post(f"{API}/simulate-sms")
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["suspicious"] is True
    assert t["status"] == "pending_review"
    assert t["risk_score"] >= 80
    assert len(t["reasons_en"]) >= 3 and len(t["reasons_bn"]) >= 3
    tid = t["id"]

    r2 = s.post(f"{API}/transactions/{tid}/confirm")
    assert r2.status_code == 200
    assert r2.json()["status"] == "confirmed_mine"


# ---------------------------------------------------------------- number-check
@pytest.mark.parametrize("num,expected_level,high_risk", [
    ("01798765432", "reported", True),
    ("01555123456", "caution", False),
    ("01712345678", "safe", False),
])
def test_number_check_levels(s, reset, num, expected_level, high_risk):
    r = s.post(f"{API}/number-check", json={"number": num})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["level"] == expected_level
    assert d["flagged_high_risk"] == high_risk


def test_number_check_invalid(s):
    r = s.post(f"{API}/number-check", json={"number": "12345"})
    assert r.status_code == 400


def test_number_check_normalises_88_prefix(s, reset):
    r = s.post(f"{API}/number-check", json={"number": "+8801798765432"})
    assert r.status_code == 200
    assert r.json()["number"] == "01798765432"


# ---------------------------------------------------------------- reports / high-risk
def test_reports(s, reset):
    r = s.get(f"{API}/reports")
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list) and len(lst) > 0
    assert "masked_number" in lst[0] and "****" in lst[0]["masked_number"]


def test_high_risk(s, reset):
    r = s.get(f"{API}/high-risk")
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) >= 3
    for row in lst:
        assert "****" in row["masked_number"]


# ---------------------------------------------------------------- extract (LLM key inactive -> fallback)
def test_extract_text_returns_fields(s):
    r = s.post(f"{API}/extract/text", json={
        "text": "I got a bKash SMS: You have sent Tk 8500 to 01798765432 TrxID BKD8H27X9Q. Fake lottery call earlier."
    })
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["provider", "trx_id", "amount", "recipient_number", "scam_type", "scam_type_bn", "ai"]:
        assert k in d
    assert d["provider"] == "bKash"
    assert d["recipient_number"] == "01798765432"
    assert d["amount"] == 8500
    # ai flag is expected to be False given inactive key, but accept True if key becomes active
    assert isinstance(d["ai"], bool)


def test_extract_text_empty(s):
    r = s.post(f"{API}/extract/text", json={"text": "   "})
    assert r.status_code == 400


def test_extract_image_fallback(s):
    tiny = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 40).decode()
    r = s.post(f"{API}/extract/image", json={"image_base64": tiny})
    assert r.status_code == 200
    d = r.json()
    assert "provider" in d and "ai" in d


# ---------------------------------------------------------------- complaints (pool + community)
def test_create_complaint_updates_pool_and_txn(s, reset):
    # simulate a suspicious txn
    txn = s.post(f"{API}/simulate-sms").json()
    tid = txn["id"]

    # snapshot fraud pool for that recipient
    before = s.post(f"{API}/number-check", json={"number": txn["counterparty"]}).json()

    payload = {
        "provider": "bKash", "trx_id": txn["trx_id"], "amount": txn["amount"],
        "recipient_number": txn["counterparty"], "time": txn["time"],
        "scam_type": "Fake prize / lottery",
        "description": "Auto-test fraud complaint",
        "transaction_id": tid,
    }
    r = s.post(f"{API}/complaints", json=payload)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["reference"].startswith("PRH-")
    assert "bKash" in c["draft_en"] and "প্রহরী রেফ" in c["draft_bn"]

    # verify persistence
    lst = s.get(f"{API}/complaints").json()
    assert any(x["id"] == c["id"] for x in lst)

    # transaction should now be marked reported
    t2 = s.get(f"{API}/transactions/{tid}").json()
    assert t2["status"] == "reported"

    # fraud pool report_count incremented by 1
    after = s.post(f"{API}/number-check", json={"number": txn["counterparty"]}).json()
    assert after["report_count"] == before["report_count"] + 1


def test_complaint_new_number_seeds_pool(s, reset):
    fresh = "01711223344"
    before = s.post(f"{API}/number-check", json={"number": fresh}).json()
    assert before["level"] == "safe" and before["report_count"] == 0

    r = s.post(f"{API}/complaints", json={
        "provider": "Nagad", "trx_id": "NGD12345678", "amount": 2000,
        "recipient_number": fresh, "time": "Today 10:00",
        "scam_type": "OTP / PIN phishing", "description": "test"
    })
    assert r.status_code == 200

    after = s.post(f"{API}/number-check", json={"number": fresh}).json()
    assert after["report_count"] == 1
    assert after["level"] == "caution"


# ---------------------------------------------------------------- reset-demo
def test_reset_demo(s):
    # create a complaint to be wiped
    s.post(f"{API}/complaints", json={
        "provider": "bKash", "trx_id": "X1", "amount": 100,
        "recipient_number": "01712345670", "time": "now",
        "scam_type": "Other", "description": "wipe me"
    })
    r = s.post(f"{API}/reset-demo")
    assert r.status_code == 200 and r.json() == {"ok": True}
    lst = s.get(f"{API}/complaints").json()
    assert lst == []


# ---------------------------------------------------------------- tts / transcribe (LLM inactive => expected 502)
def test_tts_expected_502_or_200(s):
    r = s.post(f"{API}/tts", json={"text": "সতর্ক থাকুন, এটি একটি সন্দেহজনক লেনদেন।"})
    # Expected 502 because Emergent LLM key is inactive; if key becomes active, 200 is fine.
    assert r.status_code in (200, 502), r.text
    if r.status_code == 200:
        assert r.json()["url"].startswith("/api/tts/")


def test_tts_empty_text(s):
    r = s.post(f"{API}/tts", json={"text": "   "})
    assert r.status_code == 400


def test_transcribe_short_recording_rejected(s):
    files = {"audio": ("tiny.m4a", io.BytesIO(b"short"), "audio/m4a")}
    r = requests.post(f"{API}/transcribe", files=files, timeout=30)
    assert r.status_code == 400


def test_transcribe_expected_502_when_key_inactive(s):
    files = {"audio": ("test.m4a", io.BytesIO(b"\x00" * 4000), "audio/m4a")}
    r = requests.post(f"{API}/transcribe", files=files, timeout=60)
    # Emergent key inactive => 502; if it becomes active with garbage bytes => still 502 usually
    assert r.status_code in (200, 502), r.text
