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

    this.router.post(
      '/newsletter',
      withCors,
      server.handleRequest(this.subscribe)
    )
  }

  async subscribe(req: Request) {
    const { email, source } = req.body
    await Newsletter.subscribe(email, source)
  }
}
