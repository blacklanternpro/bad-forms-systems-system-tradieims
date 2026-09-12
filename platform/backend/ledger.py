"""Ledger adapters. Drafts out, statuses back — nothing else crosses the boundary.

The mock adapter is the CI/demo path; real Xero/MYOB OAuth adapters implement the
same three functions behind the same interface.
"""
import json
import secrets

import db
import svc


def provider_for(org: dict) -> str:
    settings = org.get("settings") or {}
    if isinstance(settings, str):
        settings = json.loads(settings)
    return ((settings.get("ledger") or {}).get("provider")) or "xero-mock"


async def push_draft(org: dict, kind: str, payload: dict, document_id: str | None = None) -> dict:
    """Create a draft in the ledger; returns {id, ledger_ref}. Mock: records locally."""
    ref = f"{provider_for(org).upper().replace('-', '')}-{secrets.token_hex(4).upper()}"
    row_id = await db.fetchval(
        """INSERT INTO ledger_drafts (org_id, kind, payload, status, ledger_ref, document_id, pushed_at)
           VALUES ($1,$2,$3,'pushed',$4,$5, now()) RETURNING id""",
        org["id"], kind, svc.dumps(payload), ref, document_id,
    )
    return {"id": str(row_id), "ledger_ref": ref}


async def pull_invoice_statuses(org: dict) -> int:
    """Mock status sync-back: invoices past due_on flip to overdue. Real adapters
    poll the provider API. Returns number of rows updated."""
    res = await db.execute(
        """UPDATE invoices SET status='overdue'
           WHERE org_id=$1 AND status='sent' AND due_on IS NOT NULL AND due_on < CURRENT_DATE""",
        org["id"],
    )
    return int(res.split()[-1])


async def mock_set_status(org_id: str, invoice_id: str, status: str) -> None:
    """Simulates the provider webhook/poll result flipping an invoice's status."""
    extra = ", paid_on = CURRENT_DATE" if status == "paid" else ""
    await db.execute(
        f"UPDATE invoices SET status=$3{extra} WHERE org_id=$1 AND id=$2",
        org_id, invoice_id, status,
    )
