#!/bin/sh

npm run build || exit 1
npm run migrate up || exit 1
echo "migration run"
npm run seed || exit 1
npm run migrate-assetpacks || exit 1
npm run start || exit 1
