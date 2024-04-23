import cacheControl from 'express-cache-controller'
import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import { Analytics } from './Analytics.model'
import { Request } from 'express'

export class AnalyticsRouter extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/analytics/weekly', withCors)
    this.router.options('/analytics/status', withCors)

    /**
     * Get weekly stats
     */
    this.router.get(
      '/analytics/weekly',
      withCors,
      cacheControl({ maxAge: 43200, public: true }),
      server.handleRequest(this.getWeekly)
    ),
      /**
       * Get status
       */
      this.router.get(
        '/analytics/status',
        withCors,
        server.handleRequest(this.getStatus)
      )
  }

  async getWeekly(req: Request) {
    const base = server.extractFromReq(req, 'base')
    return Analytics.getWeekly(base)
  }

  async getStatus() {
    return Analytics.getStatus()
  }
}
