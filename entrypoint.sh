#!/bin/sh

npm run migrate:docker up || exit 1
npm run seed || exit 1
npm run start || exit 1
