import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'

import { Router } from '../common/Router'
import { withPermissiveCors } from '../middleware/cors'

export class AppRouter extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/info', withPermissiveCors)

    this.router.get(
      '/info',
      withPermissiveCors,
      server.handleRequest(this.getVersion)
    )
  }

  getVersion() {
    return {
      version: env.get('npm_package_version', ''),
    }
  }
}
