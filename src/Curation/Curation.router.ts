import { server } from 'decentraland-server'
import { v4 as uuid } from 'uuid'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, AuthRequest } from '../middleware'
import { Curation } from '.'
import { hasAccess } from './access'
import { getMergedCollection } from '../Collection/util'
import { isCommitteeMember } from '../Committee'

export class CurationRouter extends Router {
  mount() {
    this.router.get(
      '/curations',
      withAuthentication,
      server.handleRequest(this.getCurations)
    )

    this.router.get(
      '/curations/:collectionId',
      withAuthentication,
      server.handleRequest(this.getCuration)
    )

    this.router.post(
      '/curations/:collectionId',
      withAuthentication,
      server.handleRequest(this.insertCuration)
    )
  }

  getCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'collectionId')
    const ethAddress = req.auth.ethAddress

    if (!(await hasAccess(ethAddress, collectionId))) {
      throw new HTTPError(
        'Unauthorized',
        { collectionId, ethAddress },
        STATUS_CODES.unauthorized
      )
    }

    return Curation.getLatestForCollection(collectionId)
  }

  getCurations = async (req: AuthRequest) => {
    const ethAddress = req.auth.ethAddress

    return (await isCommitteeMember(ethAddress))
      ? Curation.getAll()
      : Curation.getAllForAddress(ethAddress)
  }

  insertCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'collectionId')
    const ethAddress = req.auth.ethAddress

    if (!(await hasAccess(ethAddress, collectionId))) {
      throw new HTTPError(
        'Unauthorized',
        { collectionId, ethAddress },
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

    const curation = await Curation.getLatestForCollection(collection.id)

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
