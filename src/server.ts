import { env } from 'decentraland-commons'

import { AppRouter } from './App'
import { AssetPackRouter } from './AssetPack'
import { AssetRouter } from './Asset'
import { ProjectRouter } from './Project'
import { PoolRouter } from './Pool'
import { PoolGroupRouter } from './PoolGroup'
import { PoolLikeRouter } from './PoolLike'
import { ManifestRouter } from './Manifest'
import { DeploymentRouter } from './Deployment'
import { S3Router } from './S3'
import { db } from './database'
import { ExpressApp } from './common/ExpressApp'
import { withLogger } from './middleware'
import { ShareRouter } from './Share'
import { MigrationRouter } from './Migration'

const SERVER_PORT = env.get('SERVER_PORT', '5000')
const API_VERSION = env.get('API_VERSION', 'v1')
const CORS_ORIGIN = env.get('CORS_ORIGIN', '*')
const CORS_METHOD = env.get('CORS_METHOD', '*')

const app = new ExpressApp()

app
  .use(withLogger())
  .useJSON()
  .useVersion(API_VERSION)
  .useCORS(CORS_ORIGIN, CORS_METHOD)

// Mount routers
new AppRouter(app).mount()
new AssetPackRouter(app).mount()
new AssetRouter(app).mount()
new ProjectRouter(app).mount()
new PoolLikeRouter(app).mount()
new PoolGroupRouter(app).mount()
new PoolRouter(app).mount()
new ManifestRouter(app).mount()
new DeploymentRouter(app).mount()
new S3Router(app).mount()
new ShareRouter(app).mount()
new MigrationRouter(app).mount()

/* Start the server only if run directly */
if (require.main === module) {
  startServer().catch(console.error)
}

async function startServer() {
  console.log('Connecting database')
  await db.connect()
  return app.listen(SERVER_PORT)
}
