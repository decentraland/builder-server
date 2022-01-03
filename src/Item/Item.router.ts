import { Request, Response } from 'express'
import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Bridge } from '../ethereum/api/Bridge'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
  withLowercasedParams,
  withSchemaValidation,
} from '../middleware'
import { OwnableModel } from '../Ownable'
import { S3Item, getFileUploader, ACL, S3Content } from '../S3'
import {
  Collection,
  CollectionAttributes,
  CollectionService,
} from '../Collection'
import { hasPublicAccess as hasCollectionAccess } from '../Collection/access'
import { isCommitteeMember } from '../Committee'
import { Item } from './Item.model'
import { ItemAttributes } from './Item.types'
import { upsertItemSchema } from './Item.schema'
import { FullItem } from './Item.types'
import { hasPublicAccess } from './access'
import { ItemService } from './Item.service'
import {
  CollectionForItemLockedError,
  DCLItemAlreadyPublishedError,
  InconsistentItemError,
  ItemCantBeMovedFromCollectionError,
  NonExistentItemError,
  ThirdPartyItemAlreadyPublishedError,
  UnauthorizedToChangeToCollection,
  UnauthorizedToUpsertError,
} from './Item.errors'
import { NonExistentCollectionError } from '../Collection/Collection.errors'
import { isTPCollection } from '../Collection/utils'

export class ItemRouter extends Router {
  // To be removed once we move everything to the item service
  public collectionService = new CollectionService()
  private itemService = new ItemService()

  itemFilesRequestHandler:
    | ((req: Request, res: Response) => Promise<boolean>) // Promisified RequestHandler
    | undefined

  private modelAuthorizationCheck = (
    _: OwnableModel,
    id: string,
    ethAddress: string
  ): Promise<boolean> => {
    return this.itemService.isOwnedOrManagedBy(id, ethAddress)
  }

  mount() {
    const withItemExists = withModelExists(Item, 'id')
    const withCollectionExist = withModelExists(Collection, 'id')
    const withItemAuthorization = withModelAuthorization(
      Item,
      'id',
      this.modelAuthorizationCheck
    )
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

    // TODO: We need to paginate this. To do it, we'll have to fetch remote items via the paginated dbItemIds
    const [allItems, remoteItems, remoteTPItems] = await Promise.all([
      Item.find<ItemAttributes>(),
      collectionAPI.fetchItems(),
      thirdPartyAPI.fetchItems(),
    ])

    const { items, tpItems } = this.itemService.splitItems(allItems)

    const [fullItems, fullTPItems] = await Promise.all([
      Bridge.consolidateItems(items, remoteItems),
      Bridge.consolidateTPItems(tpItems, remoteTPItems),
    ])

    // TODO: sorting (we're not breaking pagination)
    return fullItems.concat(fullTPItems)
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

    const [
      dbItems,
      remoteItems,
      { dbTPItems, remoteTPItems },
    ] = await Promise.all([
      Item.find<ItemAttributes>({ eth_address }),
      collectionAPI.fetchItemsByAuthorizedUser(eth_address),
      this.itemService.getTPItemsByManager(eth_address),
    ])

    const [items, tpItems] = await Promise.all([
      Bridge.consolidateItems(dbItems, remoteItems),
      Bridge.consolidateTPItems(dbTPItems, remoteTPItems),
    ])

    // TODO: add sorting (we're not breaking pagination)
    return items.concat(tpItems)
  }

  async getItem(req: AuthRequest): Promise<FullItem> {
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

    try {
      const { item, collection } = await this.itemService.getItem(id)

      if (!(await hasPublicAccess(eth_address, item, collection))) {
        throw new HTTPError(
          'Unauthorized',
          { id, eth_address },
          STATUS_CODES.unauthorized
        )
      }

      return item
    } catch (error) {
      if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Not found',
          { id, eth_address },
          STATUS_CODES.notFound
        )
      } else if (error instanceof InconsistentItemError) {
        throw new HTTPError(
          error.message,
          { id, eth_address, collection_id: dbItem.collection_id },
          STATUS_CODES.error
        )
      }
      throw error
    }
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

    let fullItems: FullItem[] = []
    let fullCollection: CollectionAttributes | undefined

    const dbItems = await Item.find<ItemAttributes>({ collection_id: id })

    // TODO: Add to ItemService#getCollectionItems ?
    if (isTPCollection(dbCollection)) {
      const [{ thirdParty, item: lastItem }, remoteItems] = await Promise.all([
        thirdPartyAPI.fetchThirdPartyWithLastItem(
          dbCollection.third_party_id,
          dbCollection.urn_suffix
        ),
        thirdPartyAPI.fetchItemsByCollection(
          dbCollection.third_party_id,
          dbCollection.urn_suffix
        ),
      ])

      fullCollection = thirdParty
        ? Bridge.mergeTPCollection(dbCollection, thirdParty, lastItem)
        : dbCollection

      fullItems = await Bridge.consolidateTPItems(dbItems, remoteItems)
    } else {
      const {
        collection: remoteCollection,
        items: remoteItems,
      } = await collectionAPI.fetchCollectionWithItemsByContractAddress(
        dbCollection.contract_address!
      )

      fullCollection = remoteCollection
        ? Bridge.mergeCollection(dbCollection, remoteCollection)
        : dbCollection

      fullItems = await Bridge.consolidateItems(dbItems, remoteItems)
    }

    if (!(await hasCollectionAccess(eth_address, fullCollection))) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    return fullItems
  }

  upsertItem = async (req: AuthRequest): Promise<FullItem> => {
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
    try {
      const upsertedItem = await this.itemService.upsertItem(
        itemJSON,
        eth_address
      )
      return upsertedItem
    } catch (error) {
      if (error instanceof UnauthorizedToUpsertError) {
        throw new HTTPError(
          error.message,
          { id: error.id, eth_address: error.eth_address },
          STATUS_CODES.unauthorized
        )
      } else if (error instanceof ItemCantBeMovedFromCollectionError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.unauthorized
        )
      } else if (error instanceof UnauthorizedToChangeToCollection) {
        throw new HTTPError(
          error.message,
          {
            id: error.id,
            eth_address: error.eth_address,
            collection_id: error.collection_id,
          },
          STATUS_CODES.unauthorized
        )
      } else if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          error.message,
          { collectionId: error.id },
          STATUS_CODES.notFound
        )
      } else if (error instanceof DCLItemAlreadyPublishedError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      } else if (error instanceof CollectionForItemLockedError) {
        throw new HTTPError(error.message, { id }, STATUS_CODES.locked)
      }

      throw error
    }
  }

  deleteItem = async (req: AuthRequest): Promise<boolean> => {
    const id = server.extractFromReq(req, 'id')
    try {
      await this.itemService.deleteItem(id)
    } catch (error) {
      if (error instanceof NonExistentItemError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.notFound
        )
      } else if (error instanceof InconsistentItemError) {
        throw new HTTPError(error.message, { id: error.id }, STATUS_CODES.error)
      } else if (error instanceof CollectionForItemLockedError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.locked
        )
      } else if (error instanceof DCLItemAlreadyPublishedError) {
        throw new HTTPError(
          error.message,
          {
            id: error.id,
            contract_address: error.contractAddress,
          },
          STATUS_CODES.conflict
        )
      } else if (error instanceof ThirdPartyItemAlreadyPublishedError) {
        throw new HTTPError(
          error.message,
          {
            id: error.id,
            urn: error.urn,
          },
          STATUS_CODES.conflict
        )
      }

      throw error
    }
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
