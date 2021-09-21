import { server } from 'decentraland-server'
import { v4 as uuid } from 'uuid'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, AuthRequest } from '../middleware'
import { Curation } from '.'
import { hasAccess } from './access'
import { getMergedCollection } from '../Collection/util'

export class CollectionRouter extends Router {
  mount() {
    this.router.post(
      '/curations/:collectionId',
      withAuthentication,
      server.handleRequest(this.insertCuration)
    )
  }

  insertCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'collectionId')
    const eth_address = req.auth.ethAddress

    if (!(await hasAccess(eth_address, collectionId))) {
      throw new HTTPError(
        'Unauthorized',
        { collectionId, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const { collection } = await getMergedCollection(collectionId)

    if (!collection) {
      throw new HTTPError(
        'Collection does not exist',
        { collectionId },
        STATUS_CODES.notFound
      )
    }

    const curation = await Curation.findLatestForCollection(collection.id)

    if (curation && collection.reviewed_at < curation.timestamp) {
      throw new HTTPError(
        'There is already an ongoing review request for this collection',
        { collectionId },
        STATUS_CODES.badRequest
      )
    }

    return new Curation({
      id: uuid(),
      collection_id: collectionId,
      timestamp: new Date(),
    }).upsert()
  }
}
