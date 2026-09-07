#!/bin/bash
PGDATA=/app/pgdata
PGBIN=/usr/lib/postgresql/16/bin
if [ ! -x "$PGBIN/postgres" ]; then
  apt-get update -qq && apt-get install -y -qq postgresql-common && printf "\n" | /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y && apt-get install -y -qq postgresql-16
fi
id -u postgres >/dev/null 2>&1 || useradd -m postgres
mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  mkdir -p $PGDATA && chown -R postgres:postgres $PGDATA && chmod 700 $PGDATA
  su postgres -c "$PGBIN/initdb -D $PGDATA" >/dev/null
fi
chown -R postgres:postgres $PGDATA && chmod 700 $PGDATA
if ! su postgres -c "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
  service postgresql stop >/dev/null 2>&1 || true
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/pg.log -o '-p 5432 -k /var/run/postgresql' -w start" >/dev/null
fi
su postgres -c "psql -p 5432 -tAc \"SELECT 1 FROM pg_roles WHERE rolname='badform'\"" | grep -q 1 || su postgres -c "psql -p 5432 -c \"CREATE ROLE badform LOGIN PASSWORD 'badform' SUPERUSER\"" >/dev/null
su postgres -c "psql -p 5432 -tAc \"SELECT 1 FROM pg_database WHERE datname='badform_ims'\"" | grep -q 1 || su postgres -c "createdb -p 5432 -O badform badform_ims"
echo PG_OK
