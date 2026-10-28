import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { env } from 'dcl-ops-lib/domain'

export = async function main() {
  const name = `builder-assetpacks-${env}`

  const bucket = new aws.s3.Bucket(name, {
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

  // pool.json and the manifests upload with a private ACL; this statement serves them.
  new aws.s3.BucketPolicy(`${name}-read-policy`, {
    bucket: bucket.bucket,
    policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": "*",
        "Action": ["s3:GetObject"],
        "Resource": ["arn:aws:s3:::${bucket.bucket}/*"]
      }
    ]
  }`,
  })

  return {
    userAndBucket: { bucket: bucket.bucket },
  }
}
