import math

def gst_cents(unit_ex_gst_cents: int, qty: float = 1) -> int:
    return math.floor(unit_ex_gst_cents * qty * 0.10 + 0.5)

def line_total(unit_cents: int, qty: float = 1) -> int:
    return math.floor(unit_cents * qty + 0.5)

def markup(cents: int, markup_bps: int) -> int:
    return math.floor(cents * (1 + markup_bps / 10000) + 0.5)

def time_cents(minutes: int, cents_per_hour: int) -> int:
    return math.floor(minutes * cents_per_hour / 60 + 0.5)
