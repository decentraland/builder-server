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
import { NonExistentItemError, UnpublishedItemError } from '../Item/Item.errors'
import { Item, ThirdPartyItemAttributes } from '../Item'
import {
  NonExistentCollectionError,
  UnpublishedCollectionError,
} from '../Collection/Collection.errors'
import { isTPCollection } from '../utils/urn'
import { createAssigneeEventPost } from '../Forum'
import { ForumNewPost } from '../Forum'
import {
  CurationStatus,
  CurationType,
  patchCurationSchema,
} from './Curation.types'
import { CurationService } from './Curation.service'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import { ItemCuration, ItemCurationAttributes } from './ItemCuration'

const validator = getValidator()

export class CurationRouter extends Router {
  public collectionService = new CollectionService()

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

    this.router.post(
      '/collections/:id/curation/post',
      withAuthentication,
      server.handleRequest(this.createCurationNewAssigneePost)
    )

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
      this.collectionService.getDbTPCollectionsByManager(ethAddress),
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
    let itemIds: string[] | undefined
    try {
      itemIds = server.extractFromReq(req, 'itemIds')
    } catch (error) {}

    if (itemIds && !Array.isArray(itemIds)) {
      throw new HTTPError(
        'Invalid itemIds parameter provided.',
        { itemIds },
        STATUS_CODES.badRequest
      )
    }

    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    await this.validateAccessToCuration(
      curationService,
      ethAddress,
      collectionId
    )

    const curations = itemIds
      ? await ItemCuration.findByCollectionAndItemIds(collectionId, itemIds)
      : await ItemCuration.findByCollectionId(collectionId)

    return curations
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

    const { rowCount } = await CollectionCuration.updateByItemId(itemId)
    if (rowCount === 0) {
      throw new HTTPError(
        'Could not find a valid collection curation for the item',
        { itemId },
        STATUS_CODES.notFound
      )
    }

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
      let curationJSON: Partial<CollectionCurationAttributes> | undefined
      try {
        curationJSON = server.extractFromReq(req, 'curation')
      } catch (error) {}
      const ethAddress = req.auth.ethAddress

      return this.insertCuration(
        collectionId,
        ethAddress,
        CurationType.COLLECTION,
        curationJSON
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
    const ethAddress = req.auth.ethAddress

    try {
      const itemId = server.extractFromReq(req, 'id')

      return this.insertCuration(itemId, ethAddress, CurationType.ITEM)
    } catch (error) {
      if (error instanceof NonExistentItemError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.notFound
        )
      } else if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Not found',
          { id: error.id, ethAddress },
          STATUS_CODES.notFound
        )
      } else if (error instanceof UnpublishedItemError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      }

      throw error
    }
  }

  createCurationNewAssigneePost = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress

    if (!(await isCommitteeMember(ethAddress))) {
      throw new HTTPError(
        'Unauthorized',
        { id, ethAddress },
        STATUS_CODES.unauthorized
      )
    }
    const forumPostJSON: ForumNewPost = server.extractFromReq(req, 'forumPost')
    await createAssigneeEventPost(forumPostJSON)
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

    let fieldsToUpdate: Partial<
      CollectionCurationAttributes & ItemCurationAttributes
    > = {
      ...(curationJSON.assignee !== undefined
        ? {
            assignee: curationJSON.assignee
              ? curationJSON.assignee.toLowerCase()
              : null,
          }
        : {}),
      ...(curationJSON.status ? { status: curationJSON.status } : {}),
      updated_at: new Date(),
    }

    if (type === CurationType.ITEM) {
      fieldsToUpdate = {
        ...fieldsToUpdate,
        content_hash: await this.getItemCurationContentHash(id),
      }
    }

    return curationService.updateById(curation.id, fieldsToUpdate)
  }

  private insertCuration = async (
    id: string,
    ethAddress: string,
    type: CurationType,
    curationJSON?: Partial<CollectionCurationAttributes>
  ) => {
    const curationService = CurationService.byType(type)
    await this.validateAccessToCuration(curationService, ethAddress, id)
    const curation = await curationService.getLatestById(id)

    if (!curation && type === CurationType.ITEM) {
      throw new HTTPError(
        "Item curations can't be created for items that weren't curated before",
        { id },
        STATUS_CODES.badRequest
      )
    }

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
      if (curationJSON?.assignee) {
        attributes.assignee = curationJSON.assignee.toLowerCase()
      }
    }
    if (type === CurationType.ITEM) {
      attributes.item_id = id
      attributes.content_hash = await this.getItemCurationContentHash(id)
    }

    return curationService.getModel().create(attributes)
  }

  private getItemCurationContentHash = async (id: string) => {
    const dbItem = await Item.findOne<ThirdPartyItemAttributes>(id)
    if (!dbItem)
      throw new HTTPError(
        'There is no curation associated to that item',
        { id },
        STATUS_CODES.badRequest
      )
    return dbItem.local_content_hash
  }

  private validateAccessToCuration = async (
    service: CurationService<any>,
    ethAddress: string,
    id: string
  ) => {
    let hasAccess: boolean
    try {
      hasAccess = await service.hasAccess(id, ethAddress)
    } catch (error) {
      if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Not found',
          { id: error.id, ethAddress },
          STATUS_CODES.notFound
        )
      } else if (error instanceof UnpublishedCollectionError) {
        throw new HTTPError(
          'Unpublished collection',
          { id: error.id, ethAddress },
          STATUS_CODES.conflict
        )
      }
      throw error
    }

    if (!hasAccess) {
      throw new HTTPError(
        'Unauthorized',
        { id, ethAddress },
        STATUS_CODES.unauthorized
      )
    }
  }
}
