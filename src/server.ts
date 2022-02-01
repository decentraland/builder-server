import { env } from 'decentraland-commons'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { v4 as uuid } from 'uuid'

import { AppRouter } from './App'
import { AssetPackRouter } from './AssetPack'
import { AssetRouter } from './Asset'
import { ProjectRouter } from './Project'
import { PoolRouter } from './Pool'
import { PoolGroupRouter } from './PoolGroup'
import { PoolLikeRouter } from './PoolLike'
import { Item, ItemRouter, ItemType } from './Item'
import { Collection, CollectionRouter } from './Collection'
import { CurationRouter } from './Curation'
import { CommitteeRouter } from './Committee'
import { ThirdPartyRouter } from './ThirdParty'
import { RarityRouter } from './Rarity'
import { ForumRouter } from './Forum/Forum.router'
import { ManifestRouter } from './Manifest'
import { DeploymentRouter } from './Deployment'
import { TiersRouter } from './Tiers'
import { S3Router } from './S3'
import { ShareRouter } from './Share'
import { AnalyticsRouter } from './Analytics'
import { db } from './database'
import { ExpressApp } from './common/ExpressApp'
import { withLogger } from './middleware'
import { ProjectByCoordRouter } from './Project'
import { errorHandler } from './common/errorHandler'

const SERVER_PORT = env.get('SERVER_PORT', '5000')
const API_VERSION = env.get('API_VERSION', 'v1')
const CORS_ORIGIN = env.get('CORS_ORIGIN', '*')
const CORS_METHOD = env.get('CORS_METHOD', '*')

export const app = new ExpressApp()
const logs = createConsoleLogComponent()

app
  .useCORS(CORS_ORIGIN, CORS_METHOD)
  .use(withLogger())
  .useJSON()
  .useVersion(API_VERSION)
  .useMetrics()

// Mount routers
new AppRouter(app).mount()
new AssetPackRouter(app, logs).mount()
new AssetRouter(app).mount()
new ProjectRouter(app).mount()
new ProjectByCoordRouter(app).mount()
new PoolLikeRouter(app).mount()
new PoolGroupRouter(app).mount()
new PoolRouter(app).mount()
new ItemRouter(app).mount()
new CollectionRouter(app).mount()
new CurationRouter(app).mount()
new CommitteeRouter(app).mount()
new ThirdPartyRouter(app).mount()
new RarityRouter(app).mount()
new ForumRouter(app).mount()
new ManifestRouter(app).mount()
new DeploymentRouter(app).mount()
new S3Router(app).mount()
new ShareRouter(app).mount()
new AnalyticsRouter(app).mount()
new TiersRouter(app).mount()

app.use(errorHandler)

/* Start the server only if run directly */
if (require.main === module) {
  startServer().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

async function startServer() {
  console.log('Connecting to the DB!')
  await db.connect()

  return app.listen(SERVER_PORT)
}

export async function createFodder() {
  const baseItem = {
    name: 'ScriptItem',
    description: '',
    thumbnail: '',
    eth_address: '0x1D9aa2025b67f0F21d1603ce521bda7869098f8a',
    type: ItemType.WEARABLE,
    contents: {},
    metrics: {
      triangles: 1496,
      materials: 1,
      textures: 1,
      meshes: 1,
      bodies: 1,
      entities: 1,
    },
    data: {
      category: 'upper_body',
      replaces: [],
      hides: [],
      tags: [],
      representations: [
        {
          bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseFemale'],
          mainFile: 'suitinprog03.glb',
          contents: ['suitinprog03.glb', 'thumbnail.png'],
          overrideHides: [],
          overrideReplaces: [],
        },
      ],
    },
  }

  const itemAmount = 1000000
  let batch = 0
  let promises = []

  console.log('Creating collection')
  const collection = await Collection.create({
    id: uuid(),
    name: 'ScriptCollection',
    third_party_id:
      'urn:decentraland:mumbai:collections-thirdparty:thirdparty2',
    urn_suffix: 'collection-suffix',
    eth_address: '0x1D9aa2025b67f0F21d1603ce521bda7869098f8a',
  })

  console.log(`Creating ${itemAmount} items for collection ${collection.id}`)

  for (var i = 0; i < itemAmount; i++) {
    if (batch <= 500) {
      console.log('Inserting 500 items')
      await Promise.all(promises)

      batch = 0
      promises = []
    }

    promises.push(
      Item.create({
        ...baseItem,
        id: uuid(),
        collection_id: collection.id,
        urn_suffix: `tokenId${i}`,
        content_hash: makeid(46),
      })
    )
    batch += 1
  }

  console.log(`Inserting ${promises.length} items`)
  await Promise.all(promises)
}

export function makeid(length: number) {
  var result = ''
  var characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  var charactersLength = characters.length
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}
