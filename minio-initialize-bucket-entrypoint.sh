#!/bin/bash

sleep 5

mc alias set minio http://minio:9000 admin password

if mc find minio/builder-server ; then
  echo "Bucket \"builder-server already exists, no need to create it again\""
else
  mc mb minio/builder-server
  mc policy set public minio/builder-server
fi
