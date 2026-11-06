#!/bin/bash
set -e
for db in shopwave_users shopwave_products shopwave_orders shopwave_notifications; do
  echo "Creating database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    CREATE DATABASE $db;
    GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
done
