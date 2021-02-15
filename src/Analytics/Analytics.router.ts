import cacheControl from 'express-cache-controller'
import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { Analytics } from './Analytics.model'
import { Request } from 'express'

export class AnalyticsRouter extends Router {
  mount() {
    /**
     * Get weekly stats
     */
    this.router.get(
      '/analytics/weekly',
      cacheControl({ maxAge: 43200, public: true }),
      server.handleRequest(this.getWeekly)
    ),
      /**
       * Get status
       */
      this.router.get('/analytics/status', server.handleRequest(this.getStatus))
  }

  async getWeekly(req: Request) {
    const base = server.extractFromReq(req, 'base')
    return Analytics.getWeekly(base)
  }

  async getStatus() {
    return Analytics.getStatus()
  }
}
