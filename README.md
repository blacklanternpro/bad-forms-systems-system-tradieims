# BAD FORM Trades IMS

Operational information management system for South West WA trades businesses
(sparkies, plumbers, concreters). It sits **in front of** Xero/MYOB: quote a job,
schedule the gang, photograph dockets through a verify gate, sign same-day
extras on the ute, then push drafts to the ledger with proof attached. It never
records payments and never reconciles.

Full product spec and decision log lives in [`memory/PRD.md`](memory/PRD.md).

## Stack

| Layer | Choice |
| --- | --- |
| API | FastAPI on port 8001, everything under `/api` |
| Database | PostgreSQL 16 via asyncpg, SQL migrations in `backend/migrations` |
| Frontend | One React 19 app (CRA + craco) on port 3000 |
| PDFs | reportlab letterhead documents (quotes, packs, certs, day sheets) |
| AI | GPT-5.4 vision for receipt extraction, whisper-1 for voice timesheets |
| Ledger | Xero **mocked** (drafts only, `XERO-MOCK-*` ids), MYOB not commissioned |
| Mail | Stubbed into `mail_outbox` — nothing is actually sent |

## Surfaces

- `/login` → `/cc` **Command Center** (owners and bookkeepers, email + password):
  Day Board, Quotes, Jobs, Inbox, Ledger Drafts, Directory, Modules.
- `/f/{org_slug}` **Field PWA** (crew, PIN only): today's jobs, photo/voice
  capture with an offline IndexedDB queue, hours, variations, certificates,
  job pack PDF.
- `/q/{token}` public quote accept/decline, `/s/{token}` public variation sign.
  No account needed, first signature wins.

## Repository layout

```
backend/          FastAPI app
  server.py       lifespan: ensure postgres → migrate → seed
  db.py           asyncpg pool + migration runner
  auth.py         JWT for email login and crew PIN login
  money.py        GST and cents helpers (GST = floor(cents*qty*0.10+0.5))
  svc.py          margin, job and revenue logic
  routes_cc.py    Command Center endpoints
  routes_fp.py    Field PWA and public endpoints
  pdfs.py         reportlab documents
  extractor.py    receipt vision + voice transcription
  storage.py      Emergent object storage client
  seed.py         two synthetic demo orgs
  migrations/     001_init.sql
frontend/src/
  cc/             Command Center screens
  field/          Field PWA
  pages/          Login, PublicQuote, PublicSign
  lib/            axios clients, offline outbox
scripts/          ensure_pg.sh (self-healing postgres), dev_backend.sh
tests/smoke.py    41 backend smoke assertions
```

## Running it locally

Requires Python 3.12, Node 20+, yarn, and root (postgres is managed for you).

```bash
# 1. Backend deps. The emergentintegrations wheel and the vendored litellm wheel
#    conflict in pip's resolver, so install it last with --no-deps.
python3 -m venv .venv
grep -v '^emergentintegrations==' backend/requirements.txt > /tmp/req.txt
./.venv/bin/pip install -r /tmp/req.txt
./.venv/bin/pip install --no-deps emergentintegrations==0.2.0 \
  --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# 2. Frontend deps
cd frontend && yarn install && cd ..

# 3. Environment. Both files are gitignored; see "Environment" below.
#    backend/.env and frontend/.env

# 4. Backend. Must be root: the lifespan hook runs scripts/ensure_pg.sh, which
#    starts postgres on ./pgdata and applies migrations + seeds.
sudo ./scripts/dev_backend.sh

# 5. Frontend
cd frontend && yarn start
```

The repo expects to live at `/app` (the backend shells out to
`/app/scripts/ensure_pg.sh` and `pgdata` is pinned to `/app/pgdata`). If you
have cloned it elsewhere, symlink it:

```bash
sudo ln -sfn "$PWD" /app
```

### Environment

`backend/.env`:

```
POSTGRES_URL="postgresql://badform:badform@localhost:5432/badform_ims"
JWT_SECRET="<any long random string>"
CORS_ORIGINS="*"
EMERGENT_LLM_KEY=<key>          # receipt vision, whisper, object storage
EXTRACTOR_MODE="ai"             # "fixture" for deterministic offline output
XERO_MODE="mock"
```

`frontend/.env`:

```
REACT_APP_BACKEND_URL=          # empty = same origin, i.e. requests go to /api
```

Set `REACT_APP_BACKEND_URL` to the backend's absolute origin only when the API
is served from a different host to the app.

## Demo logins

Both orgs are synthetic — every screen carries a `SYNTHETIC DEMO — NOT A CLIENT`
banner.

| Surface | Who | Credentials |
| --- | --- | --- |
| `/login` | SW Electrical owner | `owner.elec@demo.badform.invalid` / `DemoOwner!elec` |
| `/login` | SW Electrical bookkeeper | `books.elec@demo.badform.invalid` / `DemoBooks!elec` |
| `/login` | SW Concrete owner | `owner.conc@demo.badform.invalid` / `DemoOwner!conc` |
| `/f/sw-electrical-demo` | Crew | PIN `1234`, `2345` or `3456` |
| `/f/sw-concrete-demo` | Crew | PIN `1234`, `2345` or `3456` |

Owners and bookkeepers cannot log in with a PIN; crew cannot log in with an
email. Bookkeepers get 403 on scheduling and quoting.

## Tests

```bash
sudo ./.venv/bin/python tests/smoke.py
```
