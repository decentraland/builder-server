import { acceptBastionSecurityGroupId } from 'dcl-ops-lib/acceptBastion'
import * as pulumi from '@pulumi/pulumi'
import { createBucketWithUser } from 'dcl-ops-lib/createBucketWithUser'
import { createFargateTask } from 'dcl-ops-lib/createFargateTask'
import { env, envTLD, publicTLD } from 'dcl-ops-lib/domain'
import { acceptDbSecurityGroup } from 'dcl-ops-lib/acceptDb'
import { getDbHostAndPort } from 'dcl-ops-lib/supra'

const prometheusStack = new pulumi.StackReference(`prometheus-${env}`)

export = async function main() {
  const config = new pulumi.Config()

  const dbname = `builder`
  const dbpassword = config.requireSecret('db-password')
  const dbhost = getDbHostAndPort()

  const connectionString = pulumi.interpolate`postgres://${dbname}:${dbpassword}@${dbhost}/${dbname}`

  const revision = process.env['CI_COMMIT_SHA']
  const image = `decentraland/builder-server:${revision}`

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
      { name: 'DEFAULT_ASSET_PACK_CACHE', value: '86400000' },
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
            ? 'https://peer.decentraland.org'
            : 'https://peer.decentraland.zone',
      },
      {
        name: 'CHAIN_NAME',
        value: env === 'prd' || env === 'stg' ? 'Ethereum Mainnet' : 'Ropsten',
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
      {
        name: 'FORUM_API_KEY',
        value: config.requireSecret('FORUM_API_KEY'),
      },
      {
        name: 'FORUM_API_USERNAME',
        value: 'collections',
      },
      {
        name: 'FORUM_URL',
        value: 'https://forum.decentraland.org',
      },
      {
        name: 'FORUM_CATEGORY',
        value: env === 'prd' ? '12' : '14',
      },
      {
        name: 'WKC_METRICS_BEARER_TOKEN',
        value: prometheusStack.getOutput('serviceMetricsBearerToken'),
      },
      {
        name: 'RPC_URL',
        value:
          env === 'prd' || env === 'stg'
            ? 'https://rpc.decentraland.org/polygon'
            : 'https://rpc.decentraland.org/mumbai',
      },
      { name: 'WAREHOUSE_URL', value: config.requireSecret('WAREHOUSE_URL') },
      { name: 'WAREHOUSE_CONTEXT_PREFIX', value: env },
      {
        name: 'WAREHOUSE_TOKEN',
        value: config.requireSecret('WAREHOUSE_TOKEN'),
      },
      {
        name: 'THIRD_PARTY_GRAPH_URL',
        value:
          env === 'prd' || env === 'stg'
            ? 'https://api.thegraph.com/subgraphs/name/decentraland/tpr-matic-mainnet'
            : 'https://api.thegraph.com/subgraphs/name/decentraland/tpr-matic-mumbai',
      },
      {
        name: 'OPEN_SEA_URL',
        value: 'https://api.opensea.io/api/v1',
      },
      {
        name: 'OPEN_SEA_API_KEY',
        value: config.requireSecret('OPEN_SEA_API_KEY'),
      },
      {
        name: 'FF_RARITIES_WITH_ORACLE',
        value: env === 'prd' || env === 'stg' ? '0' : '1',
      },
    ],
    hostname,
    {
      extraPortMappings: [
        { containerPort: 9229, hostPort: 9229, protocol: 'tcp' },
      ],
      // @ts-ignore
      healthCheck: {
        path: '/v1/info',
        interval: 60,
        timeout: 10,
        unhealthyThreshold: 10,
        healthyThreshold: 3,
      },
      metrics: {
        path: '/metrics',
      },
      version: '1',
      memoryReservation: 1024,
      cpuReservation: env === 'prd' ? 1024 : 256,
      desiredCount: env === 'prd' ? 3 : 1,
      securityGroups: [
        (await acceptDbSecurityGroup()).id,
        await acceptBastionSecurityGroupId(),
      ],
      team: 'dapps',
    }
  )

  const publicUrl = builderApi.endpoint

  return {
    publicUrl,
    connectionString,
    userAndBucket,
  }
}
