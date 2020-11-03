import { Router } from '../common/Router'
import { server } from 'decentraland-server'
import { Analytics } from './Analytics.model'
import { Request } from 'express'

export class AnalyticsRouter extends Router {
  mount() {
    /**
     * Get all deployments
     */
    this.router.get('/analytics/weekly', server.handleRequest(this.getWeekly))
  }

  async getWeekly(req: Request) {
    const base = server.extractFromReq(req, 'base')
    return Analytics.getWeekly(base)
  }
}
