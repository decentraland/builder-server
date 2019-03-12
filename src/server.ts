import { env } from 'decentraland-commons'
import { ContestRouter } from './Contest/Contest.router'
import { ExpressApp } from './common/ExpressApp'

const SERVER_PORT = env.get('SERVER_PORT', '5000')
const API_VERSION = env.get('API_VERSION', 'v1')

const app = new ExpressApp()

const corsOrigin = env.isDevelopment() ? '*' : env.get('CORS_ORIGIN', '')
const corsMethod = env.isDevelopment() ? '*' : env.get('CORS_METHOD', '')

app
  .useJSON()
  .useVersion(API_VERSION)
  .useCORS(corsOrigin, corsMethod)

// Mount routers
new ContestRouter(app).mount()

// Start
if (require.main === module) {
  app.listen(SERVER_PORT)
}
