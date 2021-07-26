import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { collectionAPI } from '../ethereum/api/collection'

export class RarityRouter extends Router {
  mount() {
    /**
     * Returns the available rarities
     */
    this.router.get('/rarities', server.handleRequest(this.getRarities))
  }

  async getRarities() {
    const rarities = await collectionAPI.fetchRarities()
    return utils.mapOmit(rarities, ['__typename'])
  }
}
