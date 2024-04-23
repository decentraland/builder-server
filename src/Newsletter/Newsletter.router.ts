import { Request } from 'express'
import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import { Newsletter } from './Newsletter.model'

export class NewsletterRouter extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/newsletter', withCors)
    this.router.options('/newsletter/:subscriptionId', withCors)

    this.router.post(
      '/newsletter',
      withCors,
      server.handleRequest(this.subscribe)
    )
    this.router.delete(
      '/newsletter/:subscriptionId',
      withCors,
      server.handleRequest(this.deleteSubscription)
    )
    this.router.get(
      '/newsletter/:subscriptionId',
      withCors,
      server.handleRequest(this.getSubscription)
    )
  }

  async subscribe(req: Request) {
    const { email, source } = req.body
    return Newsletter.subscribe(email, source)
  }

  async deleteSubscription(req: Request) {
    const subscriptionId = server.extractFromReq(req, 'subscriptionId')
    return Newsletter.deleteSubscription(subscriptionId)
  }

  async getSubscription(req: Request) {
    const subscriptionId = server.extractFromReq(req, 'subscriptionId')
    return Newsletter.getSubscription(subscriptionId)
  }
}
