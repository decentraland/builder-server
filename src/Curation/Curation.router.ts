import { server } from 'decentraland-server'
import { v4 as uuid } from 'uuid'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, AuthRequest } from '../middleware'
import { isCommitteeMember } from '../Committee'
import { collectionAPI } from '../ethereum/api/collection'
import { getValidator } from '../utils/validator'
import { Collection } from '../Collection'
import { Item } from '../Item'
import { CurationStatus, patchCurationSchema } from './Curation.types'
import { CurationService } from './Curation.service'
import {
  NonExistentCollectionError,
  UnpublishedCollectionError,
} from '../Collection/Collection.errors'
import { CurationType } from '.'
import { getMergedCollection } from '../Collection/utils'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import { ItemCurationAttributes } from './ItemCuration'

const validator = getValidator()

// TODO: Use CurationStatus everywhere
export class CurationRouter extends Router {
  mount() {
    this.router.get(
      '/curations', // TODO: add another one with the same handler to /collectionCurations
      withAuthentication,
      server.handleRequest(this.getCollectionCurations)
    )

    // TODO: '/collections/:id/itemCurations'

    this.router.get(
      '/collections/:id/curation',
      withAuthentication,
      server.handleRequest(this.getCollectionCuration)
    )

    this.router.patch(
      '/collections/:id/curation',
      withAuthentication,
      server.handleRequest(this.updateCollectionCuration)
    )

    this.router.post(
      '/collections/:id/curation',
      withAuthentication,
      server.handleRequest(this.insertCollectionCuration)
    )

    // TODO: '/collections/:id/itemCurations'

    this.router.get(
      '/items/:id/curation',
      withAuthentication,
      server.handleRequest(this.getItemCuration)
    )

    this.router.patch(
      '/items/:id/curation',
      withAuthentication,
      server.handleRequest(this.updateItemCuration)
    )

    this.router.post(
      '/items/:id/curation',
      withAuthentication,
      server.handleRequest(this.insertItemCuration)
    )

    this.router.post(
      '/items/:id/curation',
      withAuthentication,
      server.handleRequest(this.insertItemCuration)
    )
  }

  getCollectionCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    await this.validateAccessToCuration(
      curationService,
      ethAddress,
      collectionId
    )

    return curationService.getLatestById(collectionId)
  }

  getItemCuration = async (req: AuthRequest) => {
    const itemId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.ITEM)

    await this.validateAccessToCuration(curationService, ethAddress, itemId)

    return curationService.getLatestById(itemId)
  }

  // TODO: @TPW Scope this for item/collection?
  getCollectionCurations = async (req: AuthRequest) => {
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    if (await isCommitteeMember(ethAddress)) {
      return curationService.getLatest()
    }

    // TODO: @TPW *IF we need to show tpw collections* we need to add it here  ( this.service.getDbTPCollections(eth_address) ).
    //            We'll also need to check that they're published (at least one item is published)
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

    return curationService.getLatestByIds(dbCollectionIds)
  }

  updateCollectionCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'id')
    const curationJSON: any = server.extractFromReq(req, 'curation')
    const ethAddress = req.auth.ethAddress
    return this.updateCuration(
      collectionId,
      ethAddress,
      curationJSON,
      CurationType.COLLECTION
    )
  }

  updateItemCuration = async (req: AuthRequest) => {
    const itemId = server.extractFromReq(req, 'id')
    const curationJSON: any = server.extractFromReq(req, 'curation')
    const ethAddress = req.auth.ethAddress
    return this.updateCuration(
      itemId,
      ethAddress,
      curationJSON,
      CurationType.ITEM
    )
  }

  insertCollectionCuration = async (req: AuthRequest) => {
    try {
      const collectionId = server.extractFromReq(req, 'id')
      const ethAddress = req.auth.ethAddress

      // Check if the collection is valid by requesting it to the different origins
      await getMergedCollection(collectionId)

      return this.insertCuration(
        collectionId,
        ethAddress,
        CurationType.COLLECTION
      )
    } catch (error) {
      if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Collection does not exist',
          { id: error.id },
          STATUS_CODES.notFound
        )
      }

      if (error instanceof UnpublishedCollectionError) {
        throw new HTTPError(
          'Collection is not published',
          { id: error.id },
          STATUS_CODES.unauthorized
        )
      }

      throw error
    }
  }

  insertItemCuration = async (req: AuthRequest) => {
    const itemId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const itemCuration = await this.insertCuration(
      itemId,
      ethAddress,
      CurationType.ITEM
    )

    const item = await Item.findOne(itemId)
    const collectionCuration = await CollectionCuration.findOne(
      item.collection_id
    )

    if (!collectionCuration) {
      await this.insertCuration(
        item.collection_id,
        ethAddress,
        CurationType.COLLECTION
      )
    }

    return itemCuration
  }

  private updateCuration = async (
    id: string,
    ethAddress: string,
    curationJSON: any,
    type: CurationType
  ) => {
    const curationService = CurationService.byType(type)

    await this.validateAccessToCuration(curationService, ethAddress, id)

    const validate = validator.compile(patchCurationSchema)

    validate(curationJSON)

    if (validate.errors) {
      throw new HTTPError(
        'Invalid schema',
        validate.errors,
        STATUS_CODES.badRequest
      )
    }

    const curation = await curationService.getLatestById(id)

    if (!curation) {
      throw new HTTPError(
        'Curation does not exist',
        { id },
        STATUS_CODES.notFound
      )
    }

    return curationService.getModel().update(
      {
        ...curation,
        status: curationJSON.status,
        updated_at: this.getISODate(),
      },
      { id: curation.id }
    )
  }

  private insertCuration = async (
    id: string,
    ethAddress: string,
    type: CurationType
  ) => {
    const curationService = CurationService.byType(type)

    await this.validateAccessToCuration(curationService, ethAddress, id)

    const curation = await curationService.getLatestById(id)

    if (curation && curation.status === CurationStatus.PENDING) {
      throw new HTTPError(
        'There is already an ongoing review request',
        { id },
        STATUS_CODES.badRequest
      )
    }

    const attributes: Partial<
      CollectionCurationAttributes & ItemCurationAttributes
    > = {
      id: uuid(),
      status: CurationStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
    }

    if (type === CurationType.COLLECTION) {
      attributes.collection_id = id
    }
    if (type === CurationType.ITEM) {
      attributes.item_id = id
    }

    return curationService.getModel().create(attributes)
  }

  private getISODate = () => new Date().toISOString()

  private validateAccessToCuration = async (
    service: CurationService<any>,
    id: string,
    ethAddress: string
  ) => {
    const hasAccess = await service.hasAccess(ethAddress, id)
    if (!hasAccess) {
      throw new HTTPError(
        'Unauthorized',
        { id, ethAddress },
        STATUS_CODES.unauthorized
      )
    }
  }
}
