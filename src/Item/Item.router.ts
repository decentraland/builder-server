import { Request, Response } from 'express'
import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { collectionAPI } from '../ethereum/api/collection'
import { Bridge } from '../ethereum/api/Bridge'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
} from '../middleware'
import { Ownable } from '../Ownable'
import { S3Item, getFileUploader, ACL, S3Content } from '../S3'
import { Item, ItemAttributes } from '../Item'
import { itemSchema } from './Item.types'
import { Collection, CollectionAttributes } from '../Collection'

const validator = getValidator()

export class ItemRouter extends Router {
  itemFilesRequestHandler:
    | ((req: Request, res: Response) => Promise<boolean>) // Promisified RequestHandler
    | undefined

  mount() {
    const withItemExists = withModelExists(Item, 'id')
    const withCollectionExist = withModelExists(Collection, 'id')
    const withItemAuthorization = withModelAuthorization(Item)

    this.itemFilesRequestHandler = this.getItemFilesRequestHandler()

    /**
     * Returns the items for a user
     */
    this.router.get(
      '/items',
      withAuthentication,
      server.handleRequest(this.getItems)
    )

    /**
     * Returns an item
     */
    this.router.get(
      '/items/:id',
      withItemExists,
      server.handleRequest(this.getItem)
    )

    /**
     * Returns the items of a collection
     */
    this.router.get(
      '/collections/:id/items',
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
    const [dbItems, remoteItems] = await Promise.all([
      Item.findByEthAddress(eth_address),
      collectionAPI.fetchItemsByAuthorizedUser(eth_address),
    ])

    return Bridge.consolidateItems(dbItems, remoteItems)
  }

  async getItem(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    const dbItem = await Item.findOne<ItemAttributes>(id)

    // Check if item has a collection and a blockchain id
    if (dbItem && dbItem.collection_id && dbItem.blockchain_item_id) {
      const dbCollection = await Collection.findOne<CollectionAttributes>(
        dbItem.collection_id
      )
      if (dbCollection) {
        // Find remote item and collection
        const [remoteItem, remoteCollection] = await Promise.all([
          collectionAPI.fetchItem(
            dbItem.blockchain_item_id,
            dbCollection.contract_address
          ),
          collectionAPI.fetchCollection(dbCollection.contract_address),
        ])

        // Merge
        if (remoteItem && remoteCollection) {
          return Bridge.mergeItem(dbItem, remoteItem, remoteCollection)
        }
      }
    }

    return dbItem
  }

  async getCollectionItems(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    const dbCollection = await Collection.findOne<CollectionAttributes>(id)

    if (!dbCollection) return []

    const [dbItems, remoteItems] = await Promise.all([
      Item.findByCollectionId(id),
      collectionAPI.fetchItemsByContractAddress(dbCollection.contract_address),
    ])

    return Bridge.consolidateItems(dbItems, remoteItems)
  }

  async upsertItem(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const itemJSON: any = server.extractFromReq(req, 'item')
    const eth_address = req.auth.ethAddress

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

    if (itemJSON.collection_id) {
      const dbCollectionToAddItem = await Collection.findOne<CollectionAttributes>(
        itemJSON.collection_id
      )
      // So far, only the owner can add item if the collection was not published
      if (
        !dbCollectionToAddItem ||
        dbCollectionToAddItem.eth_address.toLowerCase() !==
          eth_address.toLowerCase()
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
      if (dbItem.collection_id !== itemJSON.collection_id) {
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

      if (remoteCollection) {
        // @TODO: throw here if the collection is published. At the UI we need to stop sending updates for price/metadata changes by
        // sending the corresponding transaction directly
        console.warn("Published collections items can't be updated")
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

    const dbItem = await Item.findOne<ItemAttributes>({ id })
    const dbCollection = await Collection.findOne<CollectionAttributes>(
      dbItem!.collection_id!
    )

    if (dbCollection) {
      const remoteCollections = await collectionAPI.fetchCollection(
        dbCollection.contract_address
      )

      if (remoteCollections) {
        throw new HTTPError(
          "The item was published. It can't be deleted",
          {
            id,
            blockchain_item_id: dbItem!.blockchain_item_id,
            contract_address: dbCollection.contract_address,
          },
          STATUS_CODES.unauthorized
        )
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
