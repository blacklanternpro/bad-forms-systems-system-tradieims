#!/bin/bash
# Rolls the seeded demo schedule onto today's AWST date.
#
# seed.py pins job assignments to the date the database was first seeded, so a
# demo opened on any later day lands on an empty Day Board and an empty Field
# "today" list. This moves the most recent day of assignments forward, leaving
# jobs, quotes, receipts and drafts untouched.
set -euo pipefail

PSQL=(psql "${POSTGRES_URL:-postgresql://badform:badform@localhost:5432/badform_ims}")

"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL'
WITH awst AS (SELECT (now() AT TIME ZONE 'Australia/Perth')::date AS d),
     latest AS (SELECT max(on_date) AS d FROM job_assignments)
UPDATE job_assignments ja
   SET on_date = (SELECT d FROM awst)
  FROM latest, awst
 WHERE ja.on_date = latest.d
   AND latest.d <> awst.d;

SELECT on_date, count(*) AS assignments FROM job_assignments GROUP BY on_date ORDER BY on_date;
SQL
