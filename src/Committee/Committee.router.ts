import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { collectionAPI } from '../ethereum/api/collection'

export class CommitteeRouter extends Router {
  mount() {
    /**
     * Returns the addresses for the current committee
     */
    this.router.get('/committee', server.handleRequest(this.getCommittee))
  }

  async getCommittee() {
    const committee = await collectionAPI.fetchCommittee()
    return utils.mapOmit(committee, ['isCommitteeMember'])
  }
}
