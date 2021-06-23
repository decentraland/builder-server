import { Request, Response } from 'express'
import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { collectionAPI } from '../ethereum/api/collection'
import { Bridge } from '../ethereum/api/Bridge'
import { peerAPI } from '../ethereum/api/peer'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
  withLowercasedParams,
} from '../middleware'
import { Ownable } from '../Ownable'
import { S3Item, getFileUploader, ACL, S3Content } from '../S3'
import { Item, ItemAttributes } from '../Item'
import { RequestParameters } from '../RequestParameters'
import { Collection, CollectionAttributes } from '../Collection'
import { hasAccess as hasCollectionAccess } from '../Collection/access'
import { isCommitteeMember } from '../Committee'
import { itemSchema } from './Item.types'
import { hasAccess } from './access'

const validator = getValidator()

export class ItemRouter extends Router {
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

  async getItems(req: AuthRequest) {
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
      typeof is_published === 'undefined'
        ? Item.find<ItemAttributes>()
        : Item.find<ItemAttributes>({ is_published }),
      collectionAPI.fetchItems(),
    ])
    const catalystItems = await peerAPI.fetchWearables(
      remoteItems.map((item) => item.urn)
    )

    return Bridge.consolidateItems(dbItems, remoteItems, catalystItems)
  }

  async getAddressItems(req: AuthRequest) {
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

    let fullItem: ItemAttributes = dbItem
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
          dbCollection.contract_address,
          dbItem.blockchain_item_id
        ),
        collectionAPI.fetchCollection(dbCollection.contract_address),
      ])

      if (remoteCollection) {
        fullCollection = Bridge.mergeCollection(dbCollection, remoteCollection)

        if (remoteItem) {
          const [catalystItem] = await peerAPI.fetchWearables([remoteItem.urn])
          fullItem = Bridge.mergeItem(
            dbItem,
            remoteItem,
            catalystItem,
            remoteCollection
          )
        }
      }
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

  async getCollectionItems(req: AuthRequest) {
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

    const [dbItems, remoteItems, remoteCollection] = await Promise.all([
      Item.find<ItemAttributes>({ collection_id: id }),
      collectionAPI.fetchItemsByContractAddress(dbCollection.contract_address),
      collectionAPI.fetchCollection(dbCollection.contract_address),
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

  async upsertItem(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const itemJSON: any = server.extractFromReq(req, 'item')
    const eth_address = req.auth.ethAddress.toLowerCase()

    const validate = validator.compile(itemSchema)
    validate(itemJSON)

    if (validate.errors) {
      throw new HTTPError('Invalid schema', validate.errors)
    }

    const canUpsert = await new Ownable(Item).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new HTTPError(
        'Unauthorized user',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    if (itemJSON.is_published || itemJSON.is_approved) {
      throw new HTTPError(
        'Can not change is_published or is_approved property',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    if (itemJSON.collection_id) {
      const dbCollectionToAddItem = await Collection.findOne<CollectionAttributes>(
        itemJSON.collection_id
      )
      // So far, only the owner can add item if the collection was not published
      if (
        !dbCollectionToAddItem ||
        dbCollectionToAddItem.eth_address.toLowerCase() !== eth_address
      ) {
        throw new HTTPError(
          'Unauthorized user',
          { id, eth_address, collection_id: itemJSON.collection_id },
          STATUS_CODES.unauthorized
        )
      }
    }

    const dbItem = await Item.findOne<ItemAttributes>(id)

    if (dbItem && dbItem.collection_id) {
      if (
        itemJSON.collection_id !== null &&
        dbItem.collection_id !== itemJSON.collection_id
      ) {
        throw new HTTPError(
          "Item can't change between collections",
          { id },
          STATUS_CODES.unauthorized
        )
      }

      const dbCollection = await Collection.findOne<CollectionAttributes>(
        dbItem.collection_id
      )
      const remoteCollection = await collectionAPI.fetchCollection(
        dbCollection!.contract_address
      )

      if (remoteCollection && dbItem.in_catalyst) {
        throw new HTTPError(
          "Published collection items can't be updated",
          { id },
          STATUS_CODES.error
        )
      }
    }

    const attributes = {
      ...itemJSON,
      eth_address,
    } as ItemAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL item ids do not match', {
        urlId: id,
        bodyId: attributes.id,
      })
    }

    return new Item(attributes).upsert()
  }

  async deleteItem(req: AuthRequest) {
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
        const remoteCollection = await collectionAPI.fetchCollection(
          dbCollection.contract_address
        )

        if (remoteCollection) {
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
      }
    }

    await Item.delete({ id })
    return true
  }

  uploadItemFiles = async (req: Request, res: Response) => {
    const id = server.extractFromReq(req, 'id')
    try {
      await this.itemFilesRequestHandler!(req, res)
    } catch (error) {
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
