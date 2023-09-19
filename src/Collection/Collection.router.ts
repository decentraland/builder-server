import { Request, Response } from 'express'
import { server } from 'decentraland-server'
import { omit } from 'decentraland-commons/dist/utils'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { InvalidRequestError } from '../utils/errors'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  withLowercasedParams,
  withSchemaValidation,
  AuthRequest,
  withPermissiveAuthentication,
} from '../middleware'
import { Bridge } from '../ethereum/api/Bridge'
import {
  canUseCollectionAPIAlt,
  collectionAPI,
  collectionAPIAlt,
} from '../ethereum/api/collection'
import { OwnableModel } from '../Ownable/Ownable.types'
import { MAX_FORUM_ITEMS } from '../Item/utils'
import {
  UnpublishedItemError,
  InconsistentItemError,
} from '../Item/Item.errors'
import { Item, ItemApprovalData } from '../Item'
import { isCommitteeMember } from '../Committee'
import { sendDataToWarehouse } from '../warehouse'
import { Cheque } from '../SlotUsageCheque'
import { PaginatedResponse } from '../Pagination'
import {
  generatePaginatedResponse,
  getOffset,
  getPaginationParams,
} from '../Pagination/utils'
import { CurationStatusFilter } from '../Curation'
import { addCustomMaxAgeCacheControlHeader } from '../common/headers'
import { hasTPCollectionURN, isTPCollection } from '../utils/urn'
import { ForumService } from '../Forum/Forum.service'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'
import {
  PublishCollectionResponse,
  CollectionAttributes,
  FullCollection,
  CollectionTypeFilter,
  CollectionSort,
} from './Collection.types'
import { upsertCollectionSchema, saveTOSSchema } from './Collection.schema'
import { hasPublicAccess } from './access'
import { toFullCollection, toRemoteWhereCondition } from './utils'
import {
  AlreadyPublishedCollectionError,
  InsufficientSlotsError,
  LockedCollectionError,
  NonExistentCollectionError,
  UnauthorizedCollectionEditError,
  UnpublishedCollectionError,
  URNAlreadyInUseError,
  WrongCollectionError,
} from './Collection.errors'

const validator = getValidator()

export class CollectionRouter extends Router {
  public service = new CollectionService()
  public forumService = new ForumService()

  private modelAuthorizationCheck = (
    _: OwnableModel,
    id: string,
    ethAddress: string
  ): Promise<boolean> => {
    return this.service.isOwnedOrManagedBy(id, ethAddress)
  }

  mount() {
    const withCollectionExists = withModelExists(Collection, 'id')
    const withCollectionAuthorization = withModelAuthorization(
      Collection,
      'id',
      this.modelAuthorizationCheck
    )
    const withLowercasedAddress = withLowercasedParams(['address'])

    /**
     * Returns all collections
     */
    this.router.get(
      '/collections',
      withPermissiveAuthentication,
      server.handleRequest(this.getCollections)
    )

    /**
     * Returns the collections for an address
     */
    this.router.get(
      '/:address/collections',
      withAuthentication,
      withLowercasedAddress,
      server.handleRequest(this.getAddressCollections)
    )

    /**
     * Returns a collection
     */
    this.router.get(
      '/collections/:id',
      withAuthentication,
      withCollectionExists,
      server.handleRequest(this.getCollection)
    )

    /**
     * Handle the publication of a collection to the blockchain
     */
    this.router.post(
      '/collections/:id/publish',
      withAuthentication,
      withCollectionExists,
      server.handleRequest(this.publishCollection)
    )

    /**
     * Handle the storage of the TOS of a collection publication
     */
    this.router.post(
      '/collections/:id/tos',
      withAuthentication,
      withCollectionExists,
      server.handleRequest(this.saveTOS)
    )

    /**
     * Lock a collection until is published
     */
    this.router.post(
      '/collections/:id/lock',
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.lockCollection)
    )

    /**
     * Gets the data necessary to approve a TP Collection and generate its merkle tree
     */
    this.router.get(
      '/collections/:id/approvalData',
      withAuthentication,
      withCollectionExists,
      server.handleRequest(this.getApprovalData)
    )

    /**
     * Upserts the collection
     * Important! Collection authorization is done inside the handler
     */
    this.router.put(
      '/collections/:id',
      withAuthentication,
      withSchemaValidation(upsertCollectionSchema),
      server.handleRequest(this.upsertCollection)
    )

    /**
     * Deletes the collection
     */
    this.router.delete(
      '/collections/:id',
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.deleteCollection)
    )

    /**
     * Gets the collection addresses filtered by given filters
     */
    this.router.get(
      '/addresses',
      server.handleRequest(this.getAddressesCollections)
    )
  }

  getApprovalData = async (req: AuthRequest): Promise<ItemApprovalData> => {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    const canRequestApprovalData = await isCommitteeMember(eth_address)
    if (!canRequestApprovalData) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    try {
      return await this.service.getApprovalData(id)
    } catch (error) {
      if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          error.message,
          { id, eth_address },
          STATUS_CODES.notFound
        )
      } else if (error instanceof WrongCollectionError) {
        throw new HTTPError(error.message, error.data, STATUS_CODES.conflict)
      } else if (error instanceof UnpublishedCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.unauthorized
        )
      } else if (error instanceof InconsistentItemError) {
        throw new HTTPError(
          error.message,
          { id, eth_address },
          STATUS_CODES.error
        )
      }

      throw error
    }
  }

  getCollections = async (
    req: AuthRequest
  ): Promise<PaginatedResponse<FullCollection> | FullCollection[]> => {
    const { page, limit } = getPaginationParams(req)
    const {
      assignee,
      status,
      sort,
      q,
      is_published: isPublished,
      tag,
      type,
    } = req.query
    const eth_address = req.auth.ethAddress
    const canRequestCollections = await isCommitteeMember(eth_address)

    if (!canRequestCollections && !(q && isPublished)) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    // If status is passed, the graph query will be filtered and those results will be included in a WHERE statement in the query later on
    // If status is not passed, the query won't be filtered and all the collections will be retrieved
    const remoteCollections = await collectionAPI.fetchCollections(
      toRemoteWhereCondition({ status: status as CurationStatusFilter })
    )

    const allCollectionsWithCount = await this.service.getCollections({
      q: q as string,
      assignee: assignee as string,
      status: status as CurationStatusFilter,
      type: type as CollectionTypeFilter,
      sort: sort as CollectionSort,
      isPublished: isPublished ? isPublished === 'true' : undefined,
      offset: page && limit ? getOffset(page, limit) : undefined,
      limit,
      remoteIds: status
        ? remoteCollections.map((c) => c.id)
        : // if the status is not passed, we still want to prioritize the not approved. It won't filter by them, it'll just use them for the sort.
          // We filter at this level and not in the query because we need all the collections so they can be consolidated later on.
          remoteCollections.filter((r) => !r.isApproved).map((c) => c.id),
      itemTags: tag
        ? Array.isArray(tag)
          ? (tag as string[]).map((t) => t.toLowerCase())
          : [(tag as string).toLowerCase()]
        : undefined,
    })

    const totalCollections =
      Number(allCollectionsWithCount[0]?.collection_count) || 0

    const dbCollections = allCollectionsWithCount.map((collectionWithCount) =>
      omit<CollectionAttributes>(collectionWithCount, ['collection_count'])
    )

    const consolidated = (
      await Bridge.consolidateAllCollections(dbCollections, remoteCollections)
    ).map(toFullCollection)

    return page && limit
      ? generatePaginatedResponse(consolidated, totalCollections, limit, page)
      : consolidated
  }

  getAddressCollections = async (
    req: AuthRequest
  ): Promise<PaginatedResponse<FullCollection> | FullCollection[]> => {
    const { page, limit } = getPaginationParams(req)
    const { is_published, sort } = req.query
    const eth_address = server.extractFromReq(req, 'address')
    const auth_address = req.auth.ethAddress

    if (eth_address !== auth_address) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const authorizedRemoteCollections = await collectionAPI.fetchCollectionsByAuthorizedUser(
      eth_address
    )

    const allCollectionsWithCount = await this.service.getCollections(
      {
        offset: page && limit ? getOffset(page, limit) : undefined,
        limit,
        address: eth_address,
        sort: (sort as CollectionSort) || CollectionSort.CREATED_AT_DESC,
        isPublished: is_published ? is_published === 'true' : undefined,
        remoteIds: authorizedRemoteCollections.map(
          (remoteCollection) => remoteCollection.id
        ),
      },
      eth_address
    )

    const totalCollections =
      Number(allCollectionsWithCount[0]?.collection_count) || 0

    const dbCollections = allCollectionsWithCount.map((collectionWithCount) =>
      omit<CollectionAttributes>(collectionWithCount, ['collection_count'])
    )

    const consolidated = (
      await Bridge.consolidateAllCollections(
        dbCollections,
        authorizedRemoteCollections
      )
    ).map(toFullCollection)

    return page && limit
      ? generatePaginatedResponse(consolidated, totalCollections, limit, page)
      : consolidated
  }

  getCollection = async (req: AuthRequest): Promise<FullCollection> => {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    try {
      const collection = await this.service.getCollection(id)

      if (!(await hasPublicAccess(eth_address, collection))) {
        throw new HTTPError(
          'Unauthorized',
          { id, eth_address },
          STATUS_CODES.unauthorized
        )
      }

      return toFullCollection(collection)
    } catch (error) {
      if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Not found',
          { id, eth_address },
          STATUS_CODES.notFound
        )
      }

      throw error
    }
  }

  publishCollection = async (
    req: AuthRequest
  ): Promise<PublishCollectionResponse<FullCollection>> => {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    try {
      const dbCollection = await this.service.getDBCollection(id)

      let result: PublishCollectionResponse<CollectionAttributes>

      if (isTPCollection(dbCollection)) {
        const itemIds = server.extractFromReq<string[]>(req, 'itemIds')

        result = await this.service.publishTPCollection(
          itemIds,
          dbCollection,
          eth_address,
          server.extractFromReq<Cheque>(req, 'cheque')
        )

        // Eventually, posting to the forum will be done from the server for both collection types (https://github.com/decentraland/builder/issues/1754)
        // We should also consider deleteing Forum.router.ts
        // DCL Collections posts are being handled by the front-end at the moment and the backend updated using '/collections/:id/post'
        // TODO: Should this be halting the response? Retries?

        await this.forumService.upsertThirdPartyCollectionForumPost(
          dbCollection,
          result.items.slice(0, MAX_FORUM_ITEMS)
        )
      } else {
        const dbItems = await Item.findOrderedByCollectionId(id)
        result = await this.service.publishDCLCollection(dbCollection, dbItems)
      }

      return {
        collection: toFullCollection(result.collection),
        items: result.items,
        itemCurations: result.itemCurations,
      }
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        throw new HTTPError(error.message, { id }, STATUS_CODES.badRequest)
      } else if (error instanceof UnpublishedCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.unauthorized
        )
      } else if (error instanceof UnpublishedItemError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      } else if (error instanceof AlreadyPublishedCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      } else if (error instanceof InsufficientSlotsError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      }

      throw error
    }
  }

  saveTOS = async (req: AuthRequest): Promise<void> => {
    const tosValidator = validator.compile(saveTOSSchema)
    tosValidator(req.body)
    if (tosValidator.errors) {
      throw new HTTPError(
        'Invalid request',
        tosValidator.errors,
        STATUS_CODES.badRequest
      )
    }

    const eth_address = req.auth.ethAddress
    try {
      await sendDataToWarehouse('builder', 'publish_collection_tos', {
        email: req.body.email,
        eth_address: eth_address,
        collection_address: req.body.collection_address,
      })
    } catch (e) {
      throw new HTTPError(
        "The TOS couldn't be recorded",
        null,
        STATUS_CODES.error
      )
    }
  }

  lockCollection = async (req: AuthRequest): Promise<Date> => {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    try {
      const lock = new Date(Date.now())
      await Collection.update({ lock }, { id, eth_address })
      return lock
    } catch (error) {
      throw new HTTPError(
        "The collection couldn't be updated",
        { id, eth_address, error: (error as Error).message },
        STATUS_CODES.error
      )
    }
  }

  upsertCollection = async (req: AuthRequest): Promise<FullCollection> => {
    const id = server.extractFromReq(req, 'id')
    const collectionJSON: FullCollection = server.extractFromReq(
      req,
      'collection'
    )
    const eth_address = req.auth.ethAddress

    if (id !== collectionJSON.id) {
      throw new HTTPError(
        'The body and URL collection ids do not match',
        {
          urlId: id,
          bodyId: collectionJSON.id,
        },
        STATUS_CODES.badRequest
      )
    }

    let upsertedCollection: CollectionAttributes & { item_count: number }

    try {
      if (hasTPCollectionURN(collectionJSON)) {
        upsertedCollection = await this.service.upsertTPCollection(
          id,
          eth_address,
          collectionJSON
        )
      } else {
        upsertedCollection = await this.service.upsertDCLCollection(
          id,
          eth_address,
          collectionJSON,
          server.extractFromReq(req, 'data')
        )
      }
    } catch (error) {
      if (error instanceof LockedCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.locked
        )
      } else if (error instanceof URNAlreadyInUseError) {
        throw new HTTPError(
          error.message,
          { id: error.id, urn: error.urn },
          STATUS_CODES.conflict
        )
      } else if (error instanceof AlreadyPublishedCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      } else if (error instanceof WrongCollectionError) {
        throw new HTTPError(error.message, error.data, STATUS_CODES.conflict)
      } else if (error instanceof UnauthorizedCollectionEditError) {
        throw new HTTPError(
          error.message,
          { id: error.id, eth_address: error.eth_address },
          STATUS_CODES.unauthorized
        )
      }

      throw error
    }

    return toFullCollection(upsertedCollection)
  }

  deleteCollection = async (req: AuthRequest): Promise<boolean> => {
    const id = server.extractFromReq(req, 'id')

    try {
      await this.service.deleteCollection(id)
    } catch (error) {
      if (error instanceof AlreadyPublishedCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      } else if (error instanceof LockedCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.locked
        )
      }

      throw error
    }

    return true
  }

  getAddressesCollections = async (
    req: Request,
    res: Response
  ): Promise<PaginatedResponse<string> | string[]> => {
    const { page, limit } = getPaginationParams(req)
    const { assignee, status, sort, q, is_published, tag } = req.query

    // If the conditions are met, use the alternative collection api that uses a different subgraph.
    let desiredCollectionAPI = (await canUseCollectionAPIAlt())
      ? collectionAPIAlt
      : collectionAPI

    // If status is passed, the graph query will be filtered and those results will be included in a WHERE statement in the query later on
    // If status is not passed, the query won't be filtered and all the collections will be retrieved
    const remoteCollections = await desiredCollectionAPI.fetchCollections(
      toRemoteWhereCondition({ status: status as CurationStatusFilter })
    )

    const allCollectionsWithCount = await this.service.getCollections({
      q: q as string,
      assignee: assignee as string,
      status: status as CurationStatusFilter,
      sort: sort as CollectionSort,
      isPublished: is_published ? is_published === 'true' : undefined,
      offset: page && limit ? getOffset(page, limit) : undefined,
      limit,
      type: CollectionTypeFilter.STANDARD,
      remoteIds: status
        ? remoteCollections.map((c) => c.id)
        : // if the status is not passed, we still want to prioritize the not approved. It won't filter by them, it'll just use them for the sort.
          // We filter at this level and not in the query because we need all the collections so they can be consolidated later on.
          remoteCollections.filter((r) => !r.isApproved).map((c) => c.id),
      itemTags: tag
        ? Array.isArray(tag)
          ? (tag as string[]).map((t) => t.toLowerCase())
          : [(tag as string).toLowerCase()]
        : undefined,
    })

    const totalCollections =
      Number(allCollectionsWithCount[0]?.collection_count) || 0

    const dbCollections = allCollectionsWithCount.map((collectionWithCount) =>
      omit<CollectionAttributes>(collectionWithCount, ['collection_count'])
    )

    const consolidated = (
      await Bridge.consolidateAllCollections(dbCollections, remoteCollections)
    ).map((collection) => collection.contract_address!)

    const RES_MAX_AGE = 300 // 5 mins
    addCustomMaxAgeCacheControlHeader(res, RES_MAX_AGE)

    return page && limit
      ? generatePaginatedResponse(consolidated, totalCollections, limit, page)
      : consolidated
  }
}
