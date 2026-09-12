"""Money in integer cents, GST at 10%."""

GST_BPS = 1000  # 10.00%


def gst_cents(ex_cents: int) -> int:
    return round(ex_cents * GST_BPS / 10000)


def inc_cents(ex_cents: int) -> int:
    return ex_cents + gst_cents(ex_cents)


def fmt(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    c = abs(cents)
    return f"{sign}${c // 100:,}.{c % 100:02d}"


def line_total(qty: float, unit_cents: int) -> int:
    return round(qty * unit_cents)
