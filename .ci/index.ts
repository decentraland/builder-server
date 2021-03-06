import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { createBucketWithUser } from 'dcl-ops-lib/createBucketWithUser'
import { createFargateTask } from 'dcl-ops-lib/createFargateTask'
import { env, envTLD, publicTLD } from 'dcl-ops-lib/domain'
import { acceptDbSecurityGroup } from 'dcl-ops-lib/acceptDb'
import { getDbHostAndPort } from 'dcl-ops-lib/supra'

export = async function main() {
  const config = new pulumi.Config()

  const dbname = `builder`
  const dbpassword = config.requireSecret('db-password')
  const dbhost = getDbHostAndPort()

  const connectionString = pulumi.interpolate`postgres://${dbname}:${dbpassword}@${dbhost}/${dbname}`

  const revision = process.env['CI_COMMIT_SHA']
  const image = `decentraland/builder-server:${revision}`

  const userAndBucket = createBucketWithUser(`builder-assetpacks-${env}`)

  const AUTH0_DOMAIN =
    env === 'prd' || env === 'stg'
      ? 'decentraland.auth0.com'
      : 'dcl-test.auth0.com'

  const hostname = 'builder-api.decentraland.' + envTLD

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
      { name: 'AWS_MAX_FILE_SIZE', value: '10000000' },
      { name: 'CONNECTION_STRING', value: connectionString },
      { name: 'DEFAULT_USER_ID', value: 'email|5dee8964f0099a1255367a35' },
      { name: 'AUTH0_DOMAIN', value: AUTH0_DOMAIN },
      { name: 'DEFAULT_ASSET_PACK_CACHE', value: '60000' },
      {
        name: 'BUILDER_URL',
        value:
          'https://builder.decentraland.' +
          (env === 'prd' ? publicTLD : envTLD),
      },
      { name: 'IMAGE', value: image },
      { name: 'AWS_BUCKET_NAME', value: userAndBucket.bucket },
      { name: 'AWS_ACCESS_SECRET', value: userAndBucket.secretAccessKey },
      {
        name: 'DEFAULT_ETH_ADDRESS',
        value: '0xDc13378daFca7Fe2306368A16BCFac38c80BfCAD',
      },
      {
        name: 'BUILDER_SERVER_URL',
        value: `https://${hostname}`,
      },
      {
        name: 'BUILDER_SHARE_URL',
        value: 'https://share.decentraland.' + publicTLD,
      },
      {
        name: 'PEER_URL',
        value:
          env === 'prd' || env === 'stg'
            ? 'https://peer-ec1.decentraland.org'
            : 'https://peer.decentraland.zone',
      },
      {
        name: 'ETHEREUM_NETWORK',
        value: env === 'prd' || env === 'stg' ? 'mainnet' : 'ropsten',
      },
      {
        name: 'COLLECTIONS_GRAPH_URL',
        value:
          env === 'prd' || env === 'stg'
            ? 'https://api.thegraph.com/subgraphs/name/decentraland/collections-matic-mainnet'
            : 'https://api.thegraph.com/subgraphs/name/decentraland/collections-matic-mumbai',
      },
      {
        name: 'ANALYTICS_CONNECTION_STRING',
        value: config.requireSecret('ANALYTICS_CONNECTION_STRING'),
      },
    ],
    hostname,
    {
      // @ts-ignore
      healthCheck: {
        path: '/v1/assetPacks',
        interval: 60,
        timeout: 10,
        unhealthyThreshold: 10,
        healthyThreshold: 3
      },
      version: '1',
      memoryReservation: 1024,
      securityGroups: [(await acceptDbSecurityGroup()).id],
    }
  )

  // if (env === 'prd') {
  //   new aws.alb.ListenerRule(`listenrl-builder-${env}`, {
  //     listenerArn:
  //       'arn:aws:elasticloadbalancing:us-east-1:619079673649:listener/app/prd-alb-all/c1757689c51d84c4/36125240631de786',
  //     conditions: [
  //       { hostHeader: { values: ['builder-api.decentraland.org'] } },
  //     ],
  //     actions: [
  //       {
  //         type: 'forward',
  //         targetGroupArn:
  //           'arn:aws:elasticloadbalancing:us-east-1:619079673649:targetgroup/targ-builder-api-9b34f22/27498775635fda40',
  //       },
  //     ],
  //   })
  // }

  const publicUrl = builderApi.endpoint

  return {
    publicUrl,
    connectionString,
    userAndBucket,
  }
}
