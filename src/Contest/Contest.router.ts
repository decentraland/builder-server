import { server } from 'decentraland-server'
import { Router } from '../common'

export class ContestRouter extends Router {
  mount() {
    /**
     * Returns all stored districts
     * @return {array<District>}
     */
    this.app.post('/contest/submit', server.handleRequest(this.submitProject))
  }

  async submitProject(): Promise<any> {
    return null
  }
}
