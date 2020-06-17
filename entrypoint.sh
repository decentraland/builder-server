#!/bin/sh

npm run build || exit 1
npm run migrate up || exit 1
echo "migration run"
./migrations/node-pg-migrate --database-url-var CONNECTION_STRING --migration-file-language ts --migrations-dir /app/migrations --ignore-pattern '\\..*|.*migrate(.ts)?' up
npm run seed || exit 1
npm run migrate-assetpacks || exit 1
npm run start || exit 1
