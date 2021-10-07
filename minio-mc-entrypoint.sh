#!/bin/bash

# Required as the minio service on the docker-compose file might
# not be completely up on the execution of this file.
sleep 5

# Create an alias to the minio service so it can be accessed easily
mc alias set minio http://minio:9000 admin password

# Check if the bucket already exists
if mc find minio/builder-server ; then
  echo "Bucket \"builder-server\" already exists, no need to create it again"
else
  # Create the bucket and set the policy to public so anything can 
  # be downloaded or uploaded
  mc mb minio/builder-server
  mc policy set public minio/builder-server
fi

# Keep the service running so it can be accessed later with docker-compose exec
tail -f /dev/null
