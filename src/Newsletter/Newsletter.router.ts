import { Request } from 'express'
import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { Newsletter } from './Newsletter.model'

export class NewsletterRouter extends Router {
  mount() {
    this.router.post('/newsletter', server.handleRequest(this.subscribe))
  }

  async subscribe(req: Request) {
    const { email, source } = req.body
    return Newsletter.subscribe(email, source)
  }
}
