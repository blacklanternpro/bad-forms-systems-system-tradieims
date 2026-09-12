"""Unified notification bus. Every notification in the platform goes through emit();
nothing sends ad-hoc. In-app rows always; email/SMS via the outbox when addressed."""
import json

import db

EVENT_DEFAULTS: dict[str, str] = {
    # event_type -> default audience
    "capture_review": "staff",
    "quote_expiring": "owner",
    "recall_due": "owner",
    "invoice_overdue": "owner",
    "licence_expiring": "staff",
    "service_due": "staff",
    "po_backorder": "staff",
    "assignment_changed": "crew",
    "variation_raised": "staff",
    "quote_accepted": "staff",
    "prestart_failed": "staff",
    "sync_failed": "staff",
    "incident_reported": "owner",
}


async def emit(
    org_id: str,
    event_type: str,
    title: str,
    body: str = "",
    link: str = "",
    user_id: str | None = None,
    audience: str | None = None,
) -> str:
    aud = audience or EVENT_DEFAULTS.get(event_type, "staff")
    return await db.fetchval(
        """INSERT INTO notifications (org_id, user_id, audience, event_type, title, body, link)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id""",
        org_id, user_id, aud, event_type, title, body, link,
    )


async def queue_email(org_id: str, recipient: str, subject: str, body: str, context: dict | None = None) -> str:
    return await db.fetchval(
        """INSERT INTO comms_outbox (org_id, channel, recipient, subject, body, context)
           VALUES ($1,'email',$2,$3,$4,$5) RETURNING id""",
        org_id, recipient, subject, body, json.dumps(context or {}),
    )


async def queue_sms(org_id: str, recipient: str, body: str, context: dict | None = None) -> str:
    return await db.fetchval(
        """INSERT INTO comms_outbox (org_id, channel, recipient, subject, body, context)
           VALUES ($1,'sms',$2,NULL,$3,$4) RETURNING id""",
        org_id, recipient, body, json.dumps(context or {}),
    )


async def unread_for(org_id: str, user_id: str, role: str) -> list:
    aud = ("owner", "all") if role == "owner" else ("staff", "all") if role == "office" else ("crew", "all")
    return await db.fetch(
        """SELECT * FROM notifications
           WHERE org_id=$1 AND read_at IS NULL
             AND (user_id=$2 OR (user_id IS NULL AND (audience = ANY($3::text[]) OR $4 = 'owner')))
           ORDER BY created_at DESC LIMIT 100""",
        org_id, user_id, list(aud), role,
    )
