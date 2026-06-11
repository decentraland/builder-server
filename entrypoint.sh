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
  # Give migrations the same explicit heap ceiling as the server below (they
  # run in the same 2 GB container). Node 24's cgroup-aware default would
  # otherwise auto-size old-space to ~512 MB, which the migration step can
  # exceed. Scope NODE_OPTIONS to this command only so it doesn't leak to the
  # server process below.
  NODE_OPTIONS="--max-old-space-size=1536" npm run migrate:docker up && break || echo "Migration failed, retrying... ($i/$MAX_RETRIES)"
  sleep $RETRY_DELAY
done

if [ $i -eq $MAX_RETRIES ]; then
  echo "Migration failed after $MAX_RETRIES attempts, exiting..."
  exit 1
fi

# Cap V8's old-space heap at ~75% of the 2 GB container limit, leaving
# headroom for buffers, native allocations and stacks. Node 24 correctly
# reads the cgroup v2 limit (unlike Node 18), so the auto-sized default
# heap is otherwise too small for this service's working set.
node --max-old-space-size=1536 ./dist/src/server.js || exit 1
