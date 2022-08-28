import { createBucketWithUser } from 'dcl-ops-lib/createBucketWithUser'
import { env } from 'dcl-ops-lib/domain'

export = async function main() {
  const userAndBucket = createBucketWithUser(`builder-assetpacks-${env}`, {
    corsRules: [
      {
        allowedHeaders: ['*'],
        allowedMethods: ['GET'],
        allowedOrigins: ['*'],
        exposeHeaders: [
          'ETag',
          'Cache-Control',
          'Content-Language',
          'Content-Type',
          'Expires',
          'Last-Modified',
          'Pragma',
        ],
        maxAgeSeconds: 3000,
      },
    ],
  })

  return {
    userAndBucket,
  }
}
