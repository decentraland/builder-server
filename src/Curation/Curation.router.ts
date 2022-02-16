import { server } from 'decentraland-server'
import { v4 as uuid } from 'uuid'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, AuthRequest } from '../middleware'
import { isCommitteeMember } from '../Committee'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { getValidator } from '../utils/validator'
import { Collection, CollectionService } from '../Collection'
import { getMergedCollection, isTPCollection } from '../Collection/utils'
import { Item } from '../Item'
import { ItemCuration, ItemCurationAttributes } from './ItemCuration'
import {
  CurationStatus,
  CurationType,
  patchCurationSchema,
} from './Curation.types'
import { CurationService } from './Curation.service'
import {
  NonExistentCollectionError,
  UnpublishedCollectionError,
} from '../Collection/Collection.errors'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'

const validator = getValidator()

// TODO: Use CurationStatus everywhere
export class CurationRouter extends Router {
  mount() {
    // TODO: we might need to rename all endpoints to their actual entities:
    //   - /collections/:id/curation -> /collectionCurations/:id
    //   - /items/:id/curation -> /itemCurations/:id
    //   - etc
    this.router.get(
      '/curations',
      withAuthentication,
      server.handleRequest(this.getCollectionCurations)
    )

    this.router.get(
      '/collectionCuration/:id/itemsStats',
      withAuthentication,
      server.handleRequest(this.getCollectionCurationItemStats)
    )

    this.router.get(
      '/collections/:id/itemCurations',
      withAuthentication,
      server.handleRequest(this.getCollectionItemCurations)
    )

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
  }

  /**
   * This endpoint will return all collection curations an address has.
   * If the address is a commitee member, it'll return ALL curations. Otherwise it'll return the curations the address can see/manage.
   * Keep in mind that standard collections have a CollectionCuration that shows the state the collection is in it's curation process.
   * Conversely, TP collections have a virtual CollectionCuration which is created when its first item is curated. It'll remain `pending` forever
   */
  getCollectionCurations = async (req: AuthRequest) => {
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    if (await isCommitteeMember(ethAddress)) {
      return curationService.getLatest()
    }

    const remoteCollections = await collectionAPI.fetchCollectionsByAuthorizedUser(
      ethAddress
    )

    const contractAddresses = remoteCollections.map(
      (collection) => collection.id
    )

    const [dbCollections, dbTPCollections] = await Promise.all([
      Collection.findByContractAddresses(contractAddresses),
      new CollectionService().getDbTPCollectionsByManager(ethAddress),
    ])

    const collectionIds = dbCollections
      .concat(dbTPCollections)
      .map((collection) => collection.id)

    return curationService.getLatestByIds(collectionIds)
  }

  getCollectionCurationItemStats = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    await this.validateAccessToCuration(
      curationService,
      ethAddress,
      collectionId
    )

    const collection = await Collection.findOne(collectionId)
    if (!isTPCollection(collection)) {
      throw new HTTPError(
        'Collection is not a third party collection',
        { id: collectionId },
        STATUS_CODES.badRequest
      )
    }

    // TODO: This request could be huge. The method should work, as it's fetching page after page of items but this endpoint should probably be paginated.
    const publishedItems = await thirdPartyAPI.fetchItemsByCollection(
      collection.third_party_id,
      collectionId
    )

    const total = publishedItems.length
    let approved = 0
    let rejected = 0
    let needsReview = 0

    for (const item of publishedItems) {
      if (item.isApproved) {
        approved += 1
      } else if (item.createdAt === item.reviewedAt) {
        needsReview += 1
      } else {
        rejected += 1
      }
    }

    return {
      total,
      approved,
      rejected,
      needsReview,
    }
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

  getCollectionItemCurations = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    await this.validateAccessToCuration(
      curationService,
      ethAddress,
      collectionId
    )

    return ItemCuration.findByCollectionId(collectionId)
  }

  getItemCuration = async (req: AuthRequest) => {
    const itemId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.ITEM)

    await this.validateAccessToCuration(curationService, ethAddress, itemId)

    return curationService.getLatestById(itemId)
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

    const collectionCuration = await CollectionCuration.findByItemId(itemId)

    if (!collectionCuration) {
      const item = await Item.findOne(itemId)

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
