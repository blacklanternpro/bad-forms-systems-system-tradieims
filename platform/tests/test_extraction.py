"""Extraction golden set: fixtures must pass their own sanity checks, corrupted
payloads must be forced into review, and thresholds must respect org overrides."""
import aigate

ORG_DEFAULT = {"settings": {}}
ORG_STRICT = {"settings": {"ai": {"thresholds": {"receipt": 0.99}}}}


def test_all_fixtures_pass_their_sanity_checks():
    for capture_type, fixture in aigate.FIXTURES.items():
        fields = {k: v for k, v in fixture.items() if k != "confidence"}
        checks = aigate.sanity_checks(capture_type, fields)
        failed = [c for c in checks if not c["ok"]]
        assert not failed, f"{capture_type}: {failed}"
        conf = aigate.effective_confidence(fixture["confidence"], checks)
        assert conf == fixture["confidence"]


def test_corrupted_receipt_arithmetic_forces_review():
    fields = {k: v for k, v in aigate.FIXTURES["receipt"].items() if k != "confidence"}
    fields["subtotal_ex_cents"] = 999999  # lines no longer sum
    checks = aigate.sanity_checks("receipt", fields)
    assert any(not c["ok"] for c in checks)
    conf = aigate.effective_confidence(0.95, checks)
    assert conf <= 0.40
    assert aigate.route(ORG_DEFAULT, "receipt", conf) == "review"


def test_gst_mismatch_fails_check():
    fields = {k: v for k, v in aigate.FIXTURES["receipt"].items() if k != "confidence"}
    fields["gst_cents"] = fields["subtotal_ex_cents"]  # 100% "GST"
    checks = {c["name"]: c["ok"] for c in aigate.sanity_checks("receipt", fields)}
    assert checks["gst_is_10pct"] is False


def test_implausible_tonnage_and_hours():
    checks = aigate.sanity_checks("quarry_ticket", {"tonnes": 400, "ticket_no": "X"})
    assert not all(c["ok"] for c in checks)
    checks = aigate.sanity_checks("hire_docket", {"hours": 30})
    assert not all(c["ok"] for c in checks)


def test_routing_uses_org_threshold_override():
    assert aigate.route(ORG_DEFAULT, "receipt", 0.94) == "fast_track"
    assert aigate.route(ORG_STRICT, "receipt", 0.94) == "review"
    assert aigate.route(ORG_DEFAULT, "receipt", 0.79) == "review"
    assert aigate.threshold_for(ORG_DEFAULT, "anything") == aigate.DEFAULT_THRESHOLD


def test_extract_fixture_mode_end_to_end(event_loop):
    res = event_loop.run_until_complete(aigate.extract("receipt", None, ORG_DEFAULT))
    assert res["mode"] == "fixture"
    assert res["confidence"] == 0.94
    assert res["fields"]["total_inc_cents"] == 159500
    assert all(c["ok"] for c in res["checks"])


def test_unknown_capture_type_defaults_to_review():
    res = ORG_DEFAULT
    assert aigate.route(res, "mystery_docket", 0.5) == "review"


def test_live_chain_total_failure_returns_zero_confidence(event_loop):
    fields, conf = event_loop.run_until_complete(aigate._live_chain("receipt", None, ORG_DEFAULT))
    assert fields == {} and conf == 0.0
