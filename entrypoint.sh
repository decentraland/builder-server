#!/bin/sh

npm run migrate:docker up || exit 1
node --inspect="0.0.0.0:9229" ./dist/src/server.js || exit 1
