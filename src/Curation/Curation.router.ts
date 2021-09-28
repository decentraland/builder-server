import { server } from 'decentraland-server'
import { v4 as uuid } from 'uuid'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, AuthRequest } from '../middleware'
import { Curation } from '.'
import { hasAccessToCollection } from './access'
import { getMergedCollection } from '../Collection/util'
import { isCommitteeMember } from '../Committee'
import { collectionAPI } from '../ethereum/api/collection'
import { Collection } from '../Collection'

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

    this.router.patch(
      '/curations/:collectionId',
      withAuthentication,
      server.handleRequest(this.updateCuration)
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

    await this.validateAccessToCuration(ethAddress, collectionId)

    return Curation.getLatestForCollection(collectionId)
  }

  getCurations = async (req: AuthRequest) => {
    const ethAddress = req.auth.ethAddress

    if (await isCommitteeMember(ethAddress)) {
      return Curation.getAllLatestByCollection()
    }

    const remoteCollections = await collectionAPI.fetchCollectionsByAuthorizedUser(
      ethAddress
    )

    const contractAddresses = remoteCollections.map(
      (collection) => collection.id
    )

    const dbCollections = await Collection.findByContractAddresses(
      contractAddresses
    )

    const dbCollectionIds = dbCollections.map((collection) => collection.id)

    return Curation.getAllLatestForCollections(dbCollectionIds)
  }

  updateCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'collectionId')
    const ethAddress = req.auth.ethAddress
    const curationJSON: any = server.extractFromReq(req, 'collection')

    await this.validateAccessToCuration(ethAddress, collectionId)

    const curation = await Curation.getLatestForCollection(collectionId)

    if (!curation) {
      throw new HTTPError(
        'Curation does not exist',
        { collectionId },
        STATUS_CODES.notFound
      )
    }

    return Curation.create({
      ...curation,
      status: curationJSON.status,
      updated_at: this.getISODate(),
    })
  }

  insertCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'collectionId')
    const ethAddress = req.auth.ethAddress

    await this.validateAccessToCuration(ethAddress, collectionId)

    const mergedCollection = await getMergedCollection(collectionId)

    if (mergedCollection.status === 'not_found') {
      throw new HTTPError(
        'Collection does not exist',
        { collectionId },
        STATUS_CODES.notFound
      )
    }

    if (mergedCollection.status === 'incomplete') {
      throw new HTTPError(
        'Collection is not published',
        { collectionId },
        STATUS_CODES.unauthorized
      )
    }

    const curation = await Curation.getLatestForCollection(
      mergedCollection.collection.id
    )

    if (
      curation &&
      mergedCollection.collection.reviewed_at < new Date(curation.created_at)
    ) {
      throw new HTTPError(
        'There is already an ongoing review request for this collection',
        { collectionId },
        STATUS_CODES.badRequest
      )
    }

    const date = this.getISODate()

    return Curation.create({
      id: uuid(),
      collection_id: collectionId,
      status: 'pending',
      created_at: date,
      updated_at: date,
    })
  }

  private getISODate = () => new Date().toISOString()

  private validateAccessToCuration = async (
    ethAddress: string,
    collectionId: string
  ) => {
    if (!(await hasAccessToCollection(ethAddress, collectionId))) {
      throw new HTTPError(
        'Unauthorized',
        { collectionId, ethAddress },
        STATUS_CODES.unauthorized
      )
    }
  }
}
