import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi import HTTPException
import svc


def test_empty_list_starts_at_0001():
    assert svc.next_cert_from_existing([], "ES") == "ES-0001"


def test_increments_max_suffix():
    assert svc.next_cert_from_existing(["ES-0001", "ES-0003"], "ES") == "ES-0004"


def test_ignores_other_prefixes():
    assert svc.next_cert_from_existing(["MIX-0099", "es-0007"], "ES") == "ES-0008"


def test_custom_official_number_advances_sequence():
    assert svc.next_cert_from_existing(["ES-2210"], "ES") == "ES-2211"


def test_allocate_trims_and_rejects_blank():
    assert svc.allocate_cert_no(None, "  ES-0001  ") == "ES-0001"
    try:
        svc.allocate_cert_no(None, "   ")
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 400
