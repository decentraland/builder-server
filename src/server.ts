import { env } from 'decentraland-commons'
import { createConsoleLogComponent } from '@well-known-components/logger'

import { AppRouter } from './App'
import { AssetPackRouter } from './AssetPack'
import { AssetRouter } from './Asset'
import { ProjectRouter } from './Project'
import { PoolRouter } from './Pool'
import { PoolGroupRouter } from './PoolGroup'
import { PoolLikeRouter } from './PoolLike'
import { ItemRouter } from './Item'
import { CollectionRouter } from './Collection'
import { CurationRouter } from './Curation'
import { CommitteeRouter } from './Committee'
import { ThirdPartyRouter } from './ThirdParty'
import { RarityRouter } from './Rarity'
import { ForumRouter } from './Forum'
import { ManifestRouter } from './Manifest'
import { DeploymentRouter } from './Deployment'
import { TiersRouter } from './Tiers'
import { S3Router } from './S3'
import { ShareRouter } from './Share'
import { AnalyticsRouter } from './Analytics'
import { OpenSeaRouter } from './OpenSea'
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
new OpenSeaRouter(app).mount()

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
