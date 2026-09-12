"""Phase 0 gate: the migration runner applies kernel + pack migrations cleanly."""


def test_migrations_apply_and_are_idempotent(migrated, event_loop):
    import db

    async def run():
        versions = [r["version"] for r in await db.fetch("SELECT version FROM schema_migrations ORDER BY version")]
        assert versions, "no migrations applied"
        assert all(":" in v for v in versions), "versions must be namespaced pack:file"
        again = await db.migrate()
        assert again == [], "second migrate must be a no-op"

    event_loop.run_until_complete(run())


def test_helpers():
    import svc

    assert svc.next_in_series([], "ES") == "ES-0001"
    assert svc.next_in_series(["ES-0007", "CC-0100", None], "ES") == "ES-0008"
    start, end = svc.week_bounds()
    assert (end - start).days == 6

    import money

    assert money.gst_cents(1000) == 100
    assert money.inc_cents(1000) == 1100
    assert money.fmt(123456) == "$1,234.56"
