import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  withLowercasedParams,
  withSchemaValidation,
  AuthRequest,
} from '../middleware'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { ItemFragment } from '../ethereum/api/fragments'
import { FullItem, Item, ItemAttributes } from '../Item'
import { isCommitteeMember } from '../Committee'
import { sendDataToWarehouse } from '../warehouse'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { upsertCollectionSchema, saveTOSSchema } from './Collection.schema'
import { hasPublicAccess } from './access'
import { toFullCollection, hasTPCollectionURN } from './utils'
import { OwnableModel } from '../Ownable/Ownable.types'
import {
  AlreadyPublishedCollectionError,
  LockedCollectionError,
  NonExistentCollectionError,
  UnauthorizedCollectionEditError,
  WrongCollectionError,
} from './Collection.errors'

const validator = getValidator()

export class CollectionRouter extends Router {
  public service = new CollectionService()

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
      withAuthentication,
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
  }

  getCollections = async (req: AuthRequest): Promise<FullCollection[]> => {
    const eth_address = req.auth.ethAddress
    const canRequestCollections = await isCommitteeMember(eth_address)

    if (!canRequestCollections) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const [
      dbCollections,
      remoteCollections,
      dbTPCollections,
    ] = await Promise.all([
      Collection.find<CollectionAttributes>(),
      collectionAPI.fetchCollections(),
      this.service.getDbTPCollections(),
    ])

    const consolidatedCollections = await Bridge.consolidateCollections(
      dbCollections,
      remoteCollections
    )
    const consolidatedTPCollections = await Bridge.consolidateTPCollections(
      dbTPCollections
    )

    // Build the full collection
    return consolidatedCollections
      .concat(consolidatedTPCollections)
      .map(toFullCollection)
  }

  getAddressCollections = async (
    req: AuthRequest
  ): Promise<FullCollection[]> => {
    const eth_address = server.extractFromReq(req, 'address')
    const auth_address = req.auth.ethAddress

    if (eth_address !== auth_address) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const [
      dbCollections,
      remoteCollections,
      dbTPCollections,
    ] = await Promise.all([
      Collection.find<CollectionAttributes>({ eth_address }),
      collectionAPI.fetchCollectionsByAuthorizedUser(eth_address),
      this.service.getDbTPCollectionsByManager(eth_address),
    ])

    const consolidatedCollections = await Bridge.consolidateCollections(
      dbCollections,
      remoteCollections
    )
    const consolidatedTPCollections = await Bridge.consolidateTPCollections(
      dbTPCollections
    )

    // Build the full collection
    return consolidatedCollections
      .concat(consolidatedTPCollections)
      .map(toFullCollection)
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
  ): Promise<{ collection: FullCollection; items: FullItem[] }> => {
    const id = server.extractFromReq(req, 'id')

    // We are using the withCollectionExists middleware so we can safely assert the collection exists
    const [dbCollection, dbItems] = await Promise.all([
      Collection.findOne<CollectionAttributes>(id),
      Item.findOrderedByCollectionId(id),
    ])
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection!.contract_address!
    )

    if (!remoteCollection) {
      // This might be a problem with the graph lagging but we delegate the retry logic on the client
      throw new HTTPError(
        'The collection is not published yet',
        { id },
        STATUS_CODES.unauthorized
      )
    }

    const items: ItemAttributes[] = [...dbItems]
    let remoteItems: ItemFragment[] = []

    const isMissingBlockchainItemIds = dbItems.some(
      (item) => item.blockchain_item_id == null
    )

    if (isMissingBlockchainItemIds) {
      remoteItems = await collectionAPI.fetchItemsByContractAddress(
        dbCollection!.contract_address!
      )

      const updates = []

      for (const [index, item] of items.entries()) {
        const remoteItem = remoteItems.find(
          (remoteItem) => Number(remoteItem.blockchainId) === index
        )
        if (!remoteItem) {
          throw new HTTPError(
            "An item couldn't be matched with the one in the blockchain",
            { itemId: item.id, collectionId: id },
            STATUS_CODES.conflict
          )
        }

        items[index].blockchain_item_id = remoteItem.blockchainId
        updates.push(
          Item.update(
            { blockchain_item_id: remoteItem.blockchainId },
            { id: item.id }
          )
        )
      }

      await Promise.all(updates)
    }

    const collection = Bridge.mergeCollection(dbCollection!, remoteCollection)

    return {
      collection: toFullCollection(collection),
      items: await Bridge.consolidateItems(items, remoteItems),
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

    let upsertedCollection: CollectionAttributes

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
}
