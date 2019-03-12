import { env } from 'decentraland-commons'
import { ContestRouter } from './Contest/Contest.router'
import { ExpressApp } from './common/ExpressApp'

const SERVER_PORT = env.get('SERVER_PORT', '5000')
const API_VERSION = env.get('API_VERSION', 'v1')

const app = new ExpressApp()

app.useJSON().useVersion(API_VERSION)

let corsOrigin = ''
let corsMethod = ''

if (env.isDevelopment()) {
  corsOrigin = '*'
  corsMethod = '*'
} else {
  corsOrigin = env.get('CORS_ORIGIN', '')
  corsMethod = env.get('CORS_METHOD', '')
}

app.useCORS(corsOrigin, corsMethod)

// Mount routers
new ContestRouter(app).mount()

// Start
if (require.main === module) {
  app.listen(SERVER_PORT)
}
