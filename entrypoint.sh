#!/bin/sh

npm run migrate:docker up || exit 1
npm run seed || exit 1
node --inspect ./dist/src/server.js || exit 1
