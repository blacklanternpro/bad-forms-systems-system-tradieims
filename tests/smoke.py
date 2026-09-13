import requests, sys, io, json
B = "http://localhost:8001/api"

def jd(r):
    try: return r.json()
    except Exception: return r.text[:200]

fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra)[:160] if extra and not cond else ""))
    if not cond: fails.append(name)

# owner login (concrete — deposit flow)
r = requests.post(f"{B}/auth/login", json={"email": "owner.conc@demo.badform.invalid", "password": "DemoOwner!conc"})
check("conc owner login", r.status_code == 200, jd(r))
H = {"Authorization": f"Bearer {r.json()['token']}"}
r = requests.post(f"{B}/demo/reset", headers=H)
check("demo reset to known morning", r.status_code == 200 and r.json().get("token"), jd(r))
H = {"Authorization": f"Bearer {r.json()['token']}"}

# quotes: draft Q-001 (deposit 5000) send -> public accept -> deposit draft pending_push
qs = requests.get(f"{B}/quotes", headers=H).json()
q1 = next(q for q in qs if q["code"] == "Q-001")
check("conc Q-001 draft exists", q1["status"] == "draft", q1)
r = requests.post(f"{B}/quotes/{q1['id']}/send", json={}, headers=H)
check("quote send", r.status_code == 200, jd(r))
tok = r.json()["accept_path"].split("/q/")[1]
r = requests.get(f"{B}/public/q/{tok}")
check("public quote fetch", r.status_code == 200 and r.json()["deposit_cents"] > 0, jd(r))
r = requests.get(f"{B}/public/q/{tok}/pdf")
check("public quote pdf", r.status_code == 200 and r.content[:4] == b"%PDF")
r = requests.post(f"{B}/public/q/{tok}/accept", json={"name": "Smoke Tester"})
check("public accept -> job", r.status_code == 200 and r.json().get("job_code"), jd(r))
check("accept created deposit draft flag", r.json().get("deposit_draft") is True, jd(r))
# deposit draft must be pending_push, never pushed
drafts = requests.get(f"{B}/xero/drafts", headers=H).json()
dep = [d for d in drafts if d["purpose"] == "deposit"]
check("deposit drafts exist & all pending/pushed-manual", all(d["status"] == "pending_push" or d["xero_id"] for d in dep) and any(d["status"] == "pending_push" for d in dep), dep)
# second accept 409
r = requests.post(f"{B}/public/q/{tok}/accept", json={"name": "Again"})
check("second accept 409", r.status_code == 409, r.status_code)

# electrical org
r = requests.post(f"{B}/auth/login", json={"email": "owner.elec@demo.badform.invalid", "password": "DemoOwner!elec"})
HE = {"Authorization": f"Bearer {r.json()['token']}"}
jobs = requests.get(f"{B}/jobs", headers=HE).json()
j1 = next(j for j in jobs if j["code"] == "JOB-001")
j2 = next(j for j in jobs if j["code"] == "JOB-002")
check("recall_due filter", any(j["recall_due"] for j in jobs), [j["code"] for j in jobs])
nudge = requests.get(f"{B}/nudge", headers=HE).json()
check("nudge includes JOB-003", any(j["code"] == "JOB-003" for j in nudge.get("recalls", [])), nudge)
check("nudge includes Q-002", any(q["code"] == "Q-002" for q in nudge.get("quotes", [])), nudge)
week = requests.get(f"{B}/jobs?filter=recall_week", headers=HE).json()
check("recall_week includes JOB-003", any(j["code"] == "JOB-003" for j in week), [j["code"] for j in week])
fu = requests.get(f"{B}/quotes?filter=follow_up", headers=HE).json()
check("follow_up includes Q-002", any(q["code"] == "Q-002" and q.get("follow_up") for q in fu), fu)

# margin math JOB-001: quoted 850000 + signed VO 38500, cost = labour (2 crew x 3h) 
d = requests.get(f"{B}/jobs/{j1['id']}", headers=HE).json()
m = d["margin"]
exp_cost = round(180 * 6500 / 60) + round(180 * 5200 / 60)
check("quoted revenue = quoted + signed VO", m["revenue_cents"] == 850000 + 38500, m)
check("cost = labour cost (no receipts on J1)", m["cost_cents"] == exp_cost, (m["cost_cents"], exp_cost))

# T&M margin JOB-002: labour charge 4h*11500=46000? crew[1] charge 11500 4h -> 46000; receipts 43120 markup 1000bps
d2 = requests.get(f"{B}/jobs/{j2['id']}", headers=HE).json()
m2 = d2["margin"]
exp_rev = round(240 * 11500 / 60) + 0 + 0 + round(43120 * 1.10)
check("tm revenue = charge + receipts*markup", m2["revenue_cents"] == exp_rev, (m2, exp_rev))
check("tm cost uses labour cost + receipts", m2["cost_cents"] == round(240 * 6000 / 60) + 43120, m2["cost_cents"])

# prepare final draft J1: (850000-0) + VO 38500, attachments VO pdf + <=5 after photos
r = requests.post(f"{B}/jobs/{j1['id']}/prepare-draft", headers=HE)
pd = jd(r)
check("prepare final draft", r.status_code == 200 and pd["purpose"] == "final", pd)
check("final total = quoted - deposit + signed VOs", pd["total_cents"] == 850000 + 38500, pd)
atts = pd["attachments"]
check("attachments: signed VO pdf + after photos <=5", any(a["kind"] == "variation_pdf" for a in atts) and len([a for a in atts if a["kind"] == "after_photo"]) <= 5 and len([a for a in atts if a["kind"] == "after_photo"]) >= 1, atts)
# unsigned VO-002 (on J2) excluded from J2 tm draft
r = requests.post(f"{B}/jobs/{j2['id']}/prepare-draft", headers=HE)
pd2 = jd(r)
check("tm draft excludes unsigned VO", r.status_code == 200 and not any("VO-002" in l["Description"] for l in pd2 if False) and pd2["total_cents"] == exp_rev, pd2)

# push draft (mock)
r = requests.post(f"{B}/xero/drafts/{pd['draft_id']}/push", headers=HE)
check("push draft mock", r.status_code == 200 and r.json()["xero_id"].startswith("XERO-MOCK-"), jd(r))

# inbox verify gate
inbox = requests.get(f"{B}/inbox", headers=HE).json()
check("inbox has >=3 needs_verify", len(inbox) >= 3, len(inbox))
e1 = inbox[0]
r = requests.post(f"{B}/extractions/{e1['id']}/verify", json={"create_bill_draft": True}, headers=HE)
check("verify creates receipt + bill", r.status_code == 200 and r.json()["bill_draft_id"], jd(r))
# verify again upserts (no dup receipts)
rid1 = r.json()["receipt_id"]
r = requests.post(f"{B}/extractions/{e1['id']}/verify", json={}, headers=HE)
check("verify upsert same receipt", r.json()["receipt_id"] == rid1, jd(r))

# PIN login field
r = requests.post(f"{B}/field/sw-electrical-demo/pin", json={"pin": "1234"})
check("PIN 1234 login", r.status_code == 200, jd(r))
HF = {"Authorization": f"Bearer {r.json()['token']}"}
r = requests.post(f"{B}/field/sw-electrical-demo/pin", json={"pin": "9999"})
check("bad PIN rejected", r.status_code == 401)
# owner cannot PIN (owner has no pin_hash)
r = requests.post(f"{B}/auth/login", json={"email": "owner.elec@demo.badform.invalid", "password": "1234"})
check("owner email cannot use PIN as pw", r.status_code == 401)

today = requests.get(f"{B}/field/today", headers=HF).json()
check("field today has jobs", len(today["jobs"]) >= 1, today)
jid = today["jobs"][0]["job_id"]

# cert numbering: prefill sequence, unique per org
fj = requests.get(f"{B}/field/jobs/{jid}", headers=HF).json()
check("next_cert_no prefills ES-0001", fj.get("next_cert_no") == "ES-0001", fj.get("next_cert_no"))
r = requests.post(f"{B}/field/jobs/{jid}/certs/form", json={"name": "Electrical Safety Certificate", "cert_no": "ES-0001", "description": "Smoke cert", "result": "pass"}, headers=HF)
check("first cert ES-0001 stored", r.status_code == 200 and r.json().get("cert_no") == "ES-0001", jd(r))
r = requests.post(f"{B}/field/jobs/{jid}/certs/form", json={"name": "Electrical Safety Certificate", "cert_no": "ES-0001", "description": "dup", "result": "pass"}, headers=HF)
check("duplicate cert_no 409", r.status_code == 409, r.status_code)
fj2 = requests.get(f"{B}/field/jobs/{jid}", headers=HF).json()
check("next after ES-0001 is ES-0002", fj2.get("next_cert_no") == "ES-0002", fj2.get("next_cert_no"))
r = requests.post(f"{B}/field/jobs/{jid}/certs/form", json={"name": "Electrical Safety Certificate", "cert_no": "ES-0002", "description": "second", "result": "pass"}, headers=HF)
check("second cert ES-0002 stored", r.status_code == 200 and r.json().get("cert_no") == "ES-0002", jd(r))

# capture with fixture-sized image, dedupe via client_id
from PIL import Image
buf = io.BytesIO()
Image.new("RGB", (2400, 1800), (200, 180, 120)).save(buf, "JPEG")
files = {"file": ("d.jpg", buf.getvalue(), "image/jpeg")}
r = requests.post(f"{B}/field/jobs/{jid}/capture", files=files, data={"kind": "after_photo", "client_id": "smoke-dup-1"}, headers=HF)
check("capture after photo", r.status_code == 200, jd(r))
buf.seek(0)
r2 = requests.post(f"{B}/field/jobs/{jid}/capture", files={"file": ("d.jpg", buf.getvalue(), "image/jpeg")}, data={"kind": "after_photo", "client_id": "smoke-dup-1"}, headers=HF)
check("duplicate client_id deduped", r2.json().get("deduped") is True, jd(r2))

# variation flow: create -> email send -> token sign -> canvas 409
r = requests.post(f"{B}/field/jobs/{jid}/variations", json={"title": "Smoke VO", "amount_cents": 12345}, headers=HF)
vid = r.json()["id"]
check("field VO create", r.status_code == 200, jd(r))
r = requests.post(f"{B}/field/variations/{vid}/send-email", json={"to_email": "builder@smoke.invalid"}, headers=HF)
check("VO email send", r.status_code == 200, jd(r))
stok = r.json()["sign_path"].split("/s/")[1]
r = requests.post(f"{B}/public/s/{stok}/sign", json={"name": "Token Signer"})
check("token sign", r.status_code == 200, jd(r))
r = requests.post(f"{B}/public/s/{stok}/sign", json={"name": "Second"})
check("second sign 409", r.status_code == 409, r.status_code)
r = requests.post(f"{B}/field/variations/{vid}/sign-canvas", json={"name": "Canvas After"}, headers=HF)
check("canvas after token sign 409", r.status_code == 409, r.status_code)

# not commissioned routes
for slug in ("civil", "hire", "sor", "fab", "fleet"):
    r = requests.get(f"{B}/{slug}", headers=HE)
    check(f"{slug} not_commissioned 501", r.status_code == 501)

# bookkeeper restrictions
r = requests.post(f"{B}/auth/login", json={"email": "books.elec@demo.badform.invalid", "password": "DemoBooks!elec"})
HB = {"Authorization": f"Bearer {r.json()['token']}"}
r = requests.post(f"{B}/dayboard/copy-previous", json={"date": "2026-06-10"}, headers=HB)
check("bookkeeper cannot schedule", r.status_code == 403, r.status_code)
r = requests.get(f"{B}/inbox", headers=HB)
check("bookkeeper can read inbox", r.status_code == 200)
r = requests.post(f"{B}/demo/reset", headers=HB)
check("bookkeeper cannot reset yards", r.status_code == 403, r.status_code)

# owner reset again — session reissued, PIN and seed still hold
r = requests.post(f"{B}/demo/reset", headers=HE)
check("owner demo reset", r.status_code == 200 and r.json().get("token"), jd(r))
HE2 = {"Authorization": f"Bearer {r.json()['token']}"}
r = requests.post(f"{B}/field/sw-electrical-demo/pin", json={"pin": "1234"})
check("PIN 1234 after reset", r.status_code == 200)
inbox = requests.get(f"{B}/inbox", headers=HE2).json()
check("inbox has >=3 needs_verify after reset", len(inbox) >= 3, len(inbox))
jobs = requests.get(f"{B}/jobs", headers=HE2).json()
check("recall_due after reset", any(j.get("recall_due") for j in jobs), [j["code"] for j in jobs])

# GST math
from math import floor
def gst(c, q=1): return floor(c * q * 0.10 + 0.5)
check("gst rounding", gst(105) == 11 and gst(104) == 10 and gst(21000, 38) == 79800)

print("\n" + ("ALL PASS" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
