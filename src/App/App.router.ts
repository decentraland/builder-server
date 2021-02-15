import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'

import { Router } from '../common/Router'

export class AppRouter extends Router {
  mount() {
    this.router.get('/info', server.handleRequest(this.getVersion))
  }

  getVersion() {
    return {
      version: env.get('npm_package_version', ''),
    }
  }
}
