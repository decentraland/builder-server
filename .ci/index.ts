import * as aws from '@pulumi/aws'
import { createBucketWithUser } from 'dcl-ops-lib/createBucketWithUser'
import { createFargateTask } from 'dcl-ops-lib/createFargateTask'
import { database } from 'dcl-ops-lib/database'
import { env, envTLD } from 'dcl-ops-lib/domain'

export = async function main() {
  const db = database(`builder`)

  const connectionString = db.connectionString

  const revision = process.env['CI_COMMIT_SHA']
  const image = `decentraland/builder-server:${revision}`

  const userAndBucket = createBucketWithUser(`builder-assetpacks-${env}`)

  const AUTH0_DOMAIN =
    env === 'prd'
      ? 'decentraland.auth0.com'
      : env === 'stg'
      ? 'dcl-stg.auth0.com'
      : 'dcl-test.auth0.com'

  const builderApi = await createFargateTask(
    `builder-api`,
    image,
    5000,
    [
      { name: 'hostname', value: `builder-server-${env}` },
      { name: 'name', value: `builder-server-${env}` },
      { name: 'NODE_ENV', value: 'production' },
      { name: 'API_VERSION', value: 'v1' },
      { name: 'SERVER_PORT', value: '5000' },
      { name: 'CORS_ORIGIN', value: '*' },
      { name: 'CORS_METHOD', value: '*' },
      { name: 'AWS_ACCESS_KEY', value: userAndBucket.accessKeyId },
      { name: 'CONNECTION_STRING', value: db.connectionString },
      { name: 'DEFAULT_USER_ID', value: 'email|5dee8964f0099a1255367a35' },
      { name: 'AUTH0_DOMAIN', value: AUTH0_DOMAIN },
      { name: 'DEFAULT_ASSET_PACK_CACHE', value: '60000' },
      { name: 'BUILDER_URL', value: 'https://builder.decentraland.' + envTLD },
      { name: 'IMAGE', value: image },
      { name: 'AWS_BUCKET_NAME', value: userAndBucket.bucket },
      { name: 'AWS_ACCESS_SECRET', value: userAndBucket.secretAccessKey },
      {
        name: 'DEFAULT_ETH_ADDRESS',
        value: '0xdc1691F63a1c450543Dc8ba6909d8a3EfFAC51B4',
      },
      {
        name: 'BUILDER_SERVER_URL',
        value: 'https://builder-api.decentraland.' + envTLD,
      },
      {
        name: 'BUILDER_SHARE_URL',
        value: 'https://share.decentraland.' + envTLD,
      },
    ],
    'builder-api.decentraland.' + envTLD,
    {
      healthCheck: {
        path: '/v1/assetPacks',
        interval: 90,
        timeout: 5,
        unhealthyThreshold: 5,
      },
    }
  )
  if (env === 'prd') {
    new aws.alb.ListenerRule(`listenrl-builder-${env}`, {
      listenerArn:
        'arn:aws:elasticloadbalancing:us-east-1:619079673649:listener/app/prd-alb-all/c1757689c51d84c4/36125240631de786',
      conditions: [{ hostHeader: { values: ['builder.decentraland.org'] } }],
      actions: [
        {
          type: 'forward',
          targetGroupArn:
            'arn:aws:elasticloadbalancing:us-east-1:619079673649:targetgroup/targ-builder-api-9b34f22/27498775635fda40',
        },
      ],
    })
  }

  const publicUrl = builderApi.endpoint

  return {
    publicUrl,
    connectionString,
    userAndBucket,
  }
}
