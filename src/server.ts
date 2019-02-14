import { env } from 'decentraland-commons'
import { ContestRouter } from './Contest/Contest.router'
import { ExpressApp } from './common/ExpressApp'
import { encrypt, decrypt } from './crypto'

const SERVER_PORT = env.get('SERVER_PORT', '5000')
const API_VERSION = env.get('API_VERSION', 'v1')

const app = new ExpressApp()

app.useJSON().useVersion(API_VERSION)

if (env.isDevelopment()) {
  app.useCORS()
}

// Mount routers
new ContestRouter(app).mount()

// Start
if (require.main === module) {
  app.listen(SERVER_PORT)

  Promise.resolve().then(async () => {
    const text = 'gato'
    const encrypted = await encrypt(text)
    const decrypted = await decrypt(encrypted)
    console.log({ text, encrypted, decrypted })
  })
}
