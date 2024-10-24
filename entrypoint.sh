#!/bin/sh
if [[ -z "${CONNECTION_STRING}" ]]; then
  if [ -z "${PG_COMPONENT_PSQL_USER}" ] || [ -z "${PG_COMPONENT_PSQL_PASSWORD}" ] || [ -z "${PG_COMPONENT_PSQL_HOST}" ] || [ -z "${PG_COMPONENT_PSQL_PORT}" ] || [ -z "${PG_COMPONENT_PSQL_DATABASE}" ]; then
    # Either the connection string or the individual DB encironenment variables must be set.
    echo "Error: Either the connection string or the individual DB environenment variables must be set."
    exit 1
  fi
  export CONNECTION_STRING=postgres://${PG_COMPONENT_PSQL_USER}:${PG_COMPONENT_PSQL_PASSWORD}@${PG_COMPONENT_PSQL_HOST}:${PG_COMPONENT_PSQL_PORT}/${PG_COMPONENT_PSQL_DATABASE}
fi

MAX_RETRIES=10
RETRY_DELAY=30

for i in $(seq 1 $MAX_RETRIES); do
  npm run migrate:docker up && break || echo "Migration failed, retrying... ($i/$MAX_RETRIES)"
  sleep $RETRY_DELAY
done

if [ $i -eq $MAX_RETRIES ]; then
  echo "Migration failed after $MAX_RETRIES attempts, exiting..."
  exit 1
fi

node --inspect="0.0.0.0:9229" ./dist/src/server.js || exit 1
