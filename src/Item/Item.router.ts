import { Request, Response } from 'express'
import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { collectionAPI } from '../ethereum/api/collection'
import { Bridge } from '../ethereum/api/Bridge'
import { peerAPI } from '../ethereum/api/peer'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
  withLowercasedParams,
  withSchemaValidation,
} from '../middleware'
import { Ownable } from '../Ownable'
import { S3Item, getFileUploader, ACL, S3Content } from '../S3'
import { RequestParameters } from '../RequestParameters'
import {
  Collection,
  CollectionAttributes,
  CollectionService,
} from '../Collection'
import { hasAccess as hasCollectionAccess } from '../Collection/access'
import { isCommitteeMember } from '../Committee'
import { Item } from './Item.model'
import { ItemAttributes } from './Item.types'
import { upsertItemSchema } from './Item.schema'
import { FullItem } from './Item.types'
import { hasAccess } from './access'
import { getDecentralandItemURN, toDBItem } from './utils'

export class ItemRouter extends Router {
  public service = new CollectionService()

  itemFilesRequestHandler:
    | ((req: Request, res: Response) => Promise<boolean>) // Promisified RequestHandler
    | undefined

  mount() {
    const withItemExists = withModelExists(Item, 'id')
    const withCollectionExist = withModelExists(Collection, 'id')
    const withItemAuthorization = withModelAuthorization(Item)
    const withLowercasedAddress = withLowercasedParams(['address'])

    this.itemFilesRequestHandler = this.getItemFilesRequestHandler()

    /**
     * Returns all items
     */
    this.router.get(
      '/items',
      withAuthentication,
      server.handleRequest(this.getItems)
    )

    /**
     * Returns the items for an address
     */
    this.router.get(
      '/:address/items',
      withAuthentication,
      withLowercasedAddress,
      server.handleRequest(this.getAddressItems)
    )

    /**
     * Returns an item
     */
    this.router.get(
      '/items/:id',
      withAuthentication,
      withItemExists,
      server.handleRequest(this.getItem)
    )

    /**
     * Returns the items of a collection
     */
    this.router.get(
      '/collections/:id/items',
      withAuthentication,
      withCollectionExist,
      server.handleRequest(this.getCollectionItems)
    )

    /**
     * Upserts the item
     * Important! Item authorization is done inside the handler
     */
    this.router.put(
      '/items/:id',
      withAuthentication,
      withSchemaValidation(upsertItemSchema),
      server.handleRequest(this.upsertItem)
    )

    /**
     * Delete item
     */
    this.router.delete(
      '/items/:id',
      withAuthentication,
      withItemExists,
      withItemAuthorization,
      server.handleRequest(this.deleteItem)
    )

    /**
     * Upload the files for an item
     */
    this.router.post(
      '/items/:id/files',
      withAuthentication,
      withItemExists,
      withItemAuthorization,
      server.handleRequest(this.uploadItemFiles)
    )
  }

  async getItems(req: AuthRequest): Promise<FullItem[]> {
    const eth_address = req.auth.ethAddress
    const canRequestItems = await isCommitteeMember(eth_address)

    if (!canRequestItems) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    let is_published: boolean | undefined
    try {
      is_published = new RequestParameters(req).getBoolean('is_published')
    } catch (error) {
      // No is_published param
    }

    const [dbItems, remoteItems] = await Promise.all([
      Item.find<ItemAttributes>(),
      collectionAPI.fetchItems(),
    ])

    const catalystItems = await peerAPI.fetchWearables(
      remoteItems.map((item) => item.urn)
    )

    const items = await Bridge.consolidateItems(
      dbItems,
      remoteItems,
      catalystItems
    )

    return items.filter(
      (item) =>
        typeof is_published === 'undefined' ||
        item.is_published === is_published
    )
  }

  async getAddressItems(req: AuthRequest): Promise<FullItem[]> {
    const eth_address = server.extractFromReq(req, 'address')
    const auth_address = req.auth.ethAddress

    if (eth_address !== auth_address) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const [dbItems, remoteItems] = await Promise.all([
      Item.find<ItemAttributes>({ eth_address }),
      collectionAPI.fetchItemsByAuthorizedUser(eth_address),
    ])

    const catalystItems = await peerAPI.fetchWearables(
      remoteItems.map((item) => item.urn)
    )

    return Bridge.consolidateItems(dbItems, remoteItems, catalystItems)
  }

  async getItem(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    const dbItem = await Item.findOne<ItemAttributes>(id)
    if (!dbItem) {
      throw new HTTPError(
        'Not found',
        { id, eth_address },
        STATUS_CODES.notFound
      )
    }

    let fullItem: FullItem = Bridge.toFullItem(dbItem)
    let fullCollection: CollectionAttributes | undefined = undefined

    if (dbItem.collection_id && dbItem.blockchain_item_id) {
      const dbCollection = await Collection.findOne<CollectionAttributes>(
        dbItem.collection_id
      )

      if (!dbCollection) {
        throw new HTTPError(
          "Invalid item. It's collection seems to be missing",
          { id, eth_address, collection_id: dbItem.collection_id },
          STATUS_CODES.error
        )
      }

      const [remoteItem, remoteCollection] = await Promise.all([
        collectionAPI.fetchItem(
          dbCollection.contract_address!,
          dbItem.blockchain_item_id
        ),
        collectionAPI.fetchCollection(dbCollection.contract_address!),
      ])

      if (remoteCollection) {
        fullCollection = Bridge.mergeCollection(dbCollection, remoteCollection)

        if (remoteItem) {
          const [catalystItem] = await peerAPI.fetchWearables([remoteItem.urn])
          fullItem = Bridge.mergeItem(
            dbItem,
            remoteItem,
            remoteCollection,
            catalystItem
          )
        }
      }

      // Set the item's URN
      fullItem.urn =
        fullItem.urn ??
        getDecentralandItemURN(dbItem, dbCollection.contract_address!)
    }

    if (!(await hasAccess(eth_address, fullItem, fullCollection))) {
      throw new HTTPError(
        'Unauthorized',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    return fullItem
  }

  async getCollectionItems(req: AuthRequest): Promise<FullItem[]> {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    const dbCollection = await Collection.findOne<CollectionAttributes>(id)
    if (!dbCollection) {
      throw new HTTPError(
        'Not found',
        { id, eth_address },
        STATUS_CODES.notFound
      )
    }

    const [
      dbItems,
      { collection: remoteCollection, items: remoteItems },
    ] = await Promise.all([
      Item.find<ItemAttributes>({ collection_id: id }),
      collectionAPI.fetchCollectionWithItemsByContractAddress(
        dbCollection.contract_address!
      ),
    ])

    const catalystItems = await peerAPI.fetchWearables(
      remoteItems.map((item) => item.urn)
    )

    const fullCollection = remoteCollection
      ? Bridge.mergeCollection(dbCollection, remoteCollection)
      : dbCollection

    if (!(await hasCollectionAccess(eth_address, fullCollection))) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    return Bridge.consolidateItems(dbItems, remoteItems, catalystItems)
  }

  upsertItem = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')
    const itemJSON: FullItem = server.extractFromReq(req, 'item')

    if (id !== itemJSON.id) {
      throw new HTTPError(
        'The body and URL item ids do not match',
        {
          urlId: id,
          bodyId: itemJSON.id,
        },
        STATUS_CODES.badRequest
      )
    }

    const eth_address = req.auth.ethAddress.toLowerCase()

    if (itemJSON.is_published || itemJSON.is_approved) {
      throw new HTTPError(
        'Can not change is_published or is_approved property',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const canUpsert = await new Ownable(Item).canUpsert(id, eth_address)

    if (!canUpsert) {
      throw new HTTPError(
        'Unauthorized user',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const dbItem = await Item.findOne<ItemAttributes>(id)

    if (dbItem) {
      const areBothCollectionIdsDefined =
        itemJSON.collection_id && dbItem.collection_id

      const isItemCollectionBeingChanged =
        areBothCollectionIdsDefined &&
        itemJSON.collection_id !== dbItem.collection_id

      if (isItemCollectionBeingChanged) {
        throw new HTTPError(
          "Item can't change between collections",
          { id },
          STATUS_CODES.unauthorized
        )
      }
    }

    const findCollection = async (id?: string | null) =>
      id ? await Collection.findOne<CollectionAttributes>(id) : undefined

    const dbCollection = await findCollection(itemJSON.collection_id)

    if (itemJSON.collection_id && !dbCollection) {
      throw new HTTPError(
        'Collection not found',
        { collectionId: itemJSON.collection_id },
        STATUS_CODES.notFound
      )
    }

    if (dbCollection) {
      const isCollectionOwnerDifferent =
        dbCollection.eth_address.toLowerCase() !== eth_address

      if (isCollectionOwnerDifferent) {
        throw new HTTPError(
          'Unauthorized user',
          { id, eth_address, collection_id: itemJSON.collection_id },
          STATUS_CODES.unauthorized
        )
      }
    }

    const isDbCollectionPublished =
      dbCollection &&
      (await this.service.isPublished(dbCollection.contract_address!))

    if (isDbCollectionPublished) {
      if (!dbItem) {
        throw new HTTPError(
          "Items can't be added to a published collection",
          { id },
          STATUS_CODES.badRequest
        )
      }

      const areBothRaritiesDefined = itemJSON.rarity && dbItem.rarity

      const isRarityBeingChanged =
        areBothRaritiesDefined && itemJSON.rarity !== dbItem.rarity

      if (isRarityBeingChanged) {
        throw new HTTPError(
          "An item rarity from a published collection can't be changed",
          { id, current: dbItem.rarity, other: itemJSON.rarity },
          STATUS_CODES.badRequest
        )
      }
    }

    if (
      dbCollection &&
      !isDbCollectionPublished &&
      this.service.isLockActive(dbCollection.lock)
    ) {
      throw new HTTPError(
        "Locked collection items can't be updated",
        { id },
        STATUS_CODES.locked
      )
    }

    const dbItemCollection = await findCollection(dbItem?.collection_id)

    const isDbItemCollectionPublished =
      dbItemCollection &&
      (await this.service.isPublished(dbItemCollection.contract_address!))

    if (isDbItemCollectionPublished && dbItem) {
      const isItemBeingRemovedFromCollection =
        !itemJSON.collection_id && dbItem.collection_id

      if (isItemBeingRemovedFromCollection) {
        throw new HTTPError(
          "Items can't be removed from a pubished collection",
          { id },
          STATUS_CODES.badRequest
        )
      }
    }

    const attributes = toDBItem({
      ...itemJSON,
      eth_address,
    })

    const item: ItemAttributes = await new Item(attributes).upsert()
    return Bridge.toFullItem(item)
  }

  deleteItem = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')

    const dbItem = await Item.findOne<ItemAttributes>(id)
    if (!dbItem) {
      throw new HTTPError('Invalid item', { id }, STATUS_CODES.notFound)
    }

    if (dbItem.collection_id) {
      const dbCollection = await Collection.findOne<CollectionAttributes>(
        dbItem.collection_id
      )

      if (dbCollection) {
        if (await this.service.isPublished(dbCollection.contract_address!)) {
          throw new HTTPError(
            "The item was published. It can't be deleted",
            {
              id,
              blockchain_item_id: dbItem.blockchain_item_id,
              contract_address: dbCollection.contract_address,
            },
            STATUS_CODES.unauthorized
          )
        }

        if (await this.service.isLockActive(dbCollection.lock)) {
          throw new HTTPError(
            "The item collection is locked. It can't be deleted",
            {
              id,
              blockchain_item_id: dbItem.blockchain_item_id,
              contract_address: dbCollection.contract_address,
            },
            STATUS_CODES.locked
          )
        }
      }
    }

    await Item.delete({ id })
    return true
  }

  uploadItemFiles = async (req: Request, res: Response) => {
    const id = server.extractFromReq(req, 'id')
    try {
      await this.itemFilesRequestHandler!(req, res)
    } catch (error: any) {
      try {
        await Promise.all([Item.delete({ id }), new S3Item(id).delete()])
      } catch (error) {
        // Skip
      }

      throw new HTTPError('An error occurred trying to upload item files', {
        message: error.message,
      })
    }
  }

  private getItemFilesRequestHandler() {
    const uploader = getFileUploader({ acl: ACL.publicRead }, (_, file) => {
      return new S3Content().getFileKey(file.fieldname)
    })
    return utils.promisify<boolean>(uploader.any())
  }
}
