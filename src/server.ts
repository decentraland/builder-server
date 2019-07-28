import { env } from 'decentraland-commons'

import { AppRouter } from './App'
import { ProjectRouter } from './Project'
import { ManifestRouter } from './Manifest'
import { db } from './database'
import { ExpressApp } from './common/ExpressApp'

const SERVER_PORT = env.get('SERVER_PORT', '5000')
const API_VERSION = env.get('API_VERSION', 'v1')
const CORS_ORIGIN = env.get('CORS_ORIGIN', '*')
const CORS_METHOD = env.get('CORS_METHOD', '*')

const app = new ExpressApp()

app
  .useJSON()
  .useVersion(API_VERSION)
  .useCORS(CORS_ORIGIN, CORS_METHOD)

// Mount routers
new AppRouter(app).mount()
new ProjectRouter(app).mount()
new ManifestRouter(app).mount()

/* Start the server only if run directly */
if (require.main === module) {
  startServer().catch(console.error)
}

async function startServer() {
  console.log('Connecting database')
  await db.connect()
  return app.listen(SERVER_PORT)
}
