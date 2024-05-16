#!/bin/sh
if [[ -z "${CONNECTION_STRING}" ]]; then
  if [ -z "${PG_COMPONENT_PSQL_USER}" ] || [ -z "${PG_COMPONENT_PSQL_PASSWORD}" ] || [ -z "${PG_COMPONENT_PSQL_HOST}" ] || [ -z "${PG_COMPONENT_PSQL_PORT}" ] || [ -z "${PG_COMPONENT_PSQL_DATABASE}" ]; then
    # Either the connection string or the individual DB encironenment variables must be set.
    echo "Error: Either the connection string or the individual DB environenment variables must be set."
    exit 1
  fi
  export CONNECTION_STRING=postgres://${PG_COMPONENT_PSQL_USER}:${PG_COMPONENT_PSQL_PASSWORD}@${PG_COMPONENT_PSQL_HOST}:${PG_COMPONENT_PSQL_PORT}/${PG_COMPONENT_PSQL_DATABASE}
fi

npm run migrate:docker up || exit 1
node --inspect="0.0.0.0:9229" ./dist/src/server.js || exit 1
