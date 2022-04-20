import { Request, Response } from 'express'
import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'
import { omit } from 'decentraland-commons/dist/utils'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { collectionAPI } from '../ethereum/api/collection'
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
import { Collection, CollectionService } from '../Collection'
import { hasPublicAccess as hasCollectionAccess } from '../Collection/access'
import { NonExistentCollectionError } from '../Collection/Collection.errors'
import { isCommitteeMember } from '../Committee'
import { ItemCuration, ItemCurationAttributes } from '../Curation/ItemCuration'
import { PaginatedResponse } from '../Pagination'
import { isTPItemURN } from '../utils/urn'
import {
  generatePaginatedResponse,
  getOffset,
  getPaginationParams,
} from '../Pagination/utils'
import { CurationStatus } from '../Curation'
import { Item } from './Item.model'
import { ItemAttributes } from './Item.types'
import { areItemRepresentationsValid, upsertItemSchema } from './Item.schema'
import { FullItem } from './Item.types'
import { hasPublicAccess } from './access'
import { ItemService } from './Item.service'
import {
  CollectionForItemLockedError,
  DCLItemAlreadyPublishedError,
  InconsistentItemError,
  InvalidItemURNError,
  ItemCantBeMovedFromCollectionError,
  NonExistentItemError,
  ThirdPartyItemAlreadyPublishedError,
  ThirdPartyItemInsertByURNError,
  UnauthorizedToChangeToCollectionError,
  UnauthorizedToUpsertError,
  URNAlreadyInUseError,
} from './Item.errors'

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
      '/items/:idOrURN',
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

  getItems = async (req: AuthRequest): Promise<FullItem[]> => {
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
    const [allItems, remoteItems, itemCurations] = await Promise.all([
      Item.find<ItemAttributes>(),
      collectionAPI.fetchItems(),
      ItemCuration.find<ItemCurationAttributes>(),
    ])

    const { items, tpItems } = this.itemService.splitItems(allItems)

    const [fullItems, fullTPItems] = await Promise.all([
      Bridge.consolidateItems(items, remoteItems),
      Bridge.consolidateTPItems(tpItems, itemCurations),
    ])

    // TODO: sorting (we're not breaking pagination)
    return fullItems.concat(fullTPItems)
  }

  getAddressItems = async (
    req: AuthRequest
  ): Promise<PaginatedResponse<FullItem> | FullItem[]> => {
    const { page, limit } = getPaginationParams(req)
    const eth_address = server.extractFromReq(req, 'address')
    let collectionId: string | undefined
    try {
      collectionId = server.extractFromReq(req, 'collectionId')
    } catch (error) {}
    const auth_address = req.auth.ethAddress

    if (eth_address !== auth_address) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const [allItemsWithCount, remoteItems, itemCurations] = await Promise.all([
      this.itemService.findItemsForAddress(eth_address, {
        collectionId,
        limit,
        offset: page && limit ? getOffset(page, limit) : undefined,
      }),
      collectionAPI.fetchItemsByAuthorizedUser(eth_address),
      ItemCuration.find<ItemCurationAttributes>(),
    ])

    const totalItems = Number(allItemsWithCount[0]?.total_count)
    const allItems = allItemsWithCount.map((itemWithCount) =>
      omit<ItemAttributes>(itemWithCount, ['total_count'])
    )
    const dbBlockchainItemIds = allItems.map((item) => item.blockchain_item_id)
    const { items: dbItems, tpItems: dbTPItems } = this.itemService.splitItems(
      allItems
    )

    const [items, tpItems] = await Promise.all([
      Bridge.consolidateItems(
        dbItems,
        remoteItems.filter((remoteItem) =>
          dbBlockchainItemIds.includes(remoteItem.blockchainId)
        )
      ),
      Bridge.consolidateTPItems(dbTPItems, itemCurations),
    ])

    const concatenated = items.concat(tpItems)

    // TODO: list.concat(list2) will not break pagination (when we add it), but it will break any order we have beforehand.
    // We'll need to add it after concatenating, cause if we don't it will have a different order each time
    return page && limit
      ? generatePaginatedResponse(concatenated, totalItems, limit, page)
      : concatenated
  }

  getItem = async (req: AuthRequest): Promise<FullItem> => {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    try {
      // TODO: both this method and this.itemService.getCollectionItems return a tuple of collection and items. Check if we can just return the items (as the method names implied)
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
          { id, eth_address },
          STATUS_CODES.error
        )
      }
      throw error
    }
  }

  getCollectionItems = async (
    req: AuthRequest
  ): Promise<PaginatedResponse<FullItem> | FullItem[]> => {
    const id = server.extractFromReq(req, 'id')
    let status: CurationStatus | undefined
    try {
      status = server.extractFromReq(req, 'status')
    } catch (error) {}

    if (status && !Object.values(CurationStatus).includes(status)) {
      throw new HTTPError(
        'Invalid Status provided',
        { id, status },
        STATUS_CODES.badRequest
      )
    }
    const { page, limit } = getPaginationParams(req)
    const eth_address = req.auth.ethAddress

    try {
      const {
        collection,
        items,
        totalItems,
      } = await this.itemService.getCollectionItems(id, {
        limit,
        offset: page && limit ? getOffset(page, limit) : undefined,
        status,
      })

      if (!(await hasCollectionAccess(eth_address, collection))) {
        throw new HTTPError(
          'Unauthorized',
          { eth_address },
          STATUS_CODES.unauthorized
        )
      }

      return page && limit
        ? generatePaginatedResponse(items, totalItems, limit, page)
        : items
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

  upsertItem = async (req: AuthRequest): Promise<FullItem> => {
    const idOrURN = server.extractFromReq(req, 'idOrURN')
    let id, urn
    if (isTPItemURN(idOrURN)) {
      urn = idOrURN
    } else {
      id = idOrURN
    }
    const itemJSON: FullItem = server.extractFromReq(req, 'item')

    if ((id && id !== itemJSON.id) || (urn && urn !== itemJSON.urn)) {
      throw new HTTPError(
        'The body and URL item id or urn do not match',
        {
          urlId: urn ?? id,
          bodyId: urn ? itemJSON.urn : itemJSON.id,
        },
        STATUS_CODES.badRequest
      )
    }

    if (!areItemRepresentationsValid(itemJSON)) {
      throw new HTTPError(
        "Representation files must be part of the item's content",
        {
          id: id || urn,
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
      if (error instanceof ThirdPartyItemInsertByURNError) {
        throw new HTTPError(
          error.message,
          { urn: error.urn },
          STATUS_CODES.notFound
        )
      } else if (error instanceof UnauthorizedToUpsertError) {
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
      } else if (error instanceof UnauthorizedToChangeToCollectionError) {
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
      } else if (error instanceof ThirdPartyItemAlreadyPublishedError) {
        throw new HTTPError(
          error.message,
          { id, urn: error.urn },
          STATUS_CODES.conflict
        )
      } else if (error instanceof URNAlreadyInUseError) {
        throw new HTTPError(
          error.message,
          { id, urn: error.urn },
          STATUS_CODES.conflict
        )
      } else if (error instanceof InvalidItemURNError) {
        throw new HTTPError(error.message, null, STATUS_CODES.badRequest)
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
