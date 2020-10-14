import { Request, Response } from 'express'
import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { collectionAPI } from '../ethereum/api/collection'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest
} from '../middleware'
import { Ownable } from '../Ownable'
import { Item, ItemAttributes } from '../Item'
import { itemSchema } from './Item.types'
import { S3Item, getFileUploader, ACL, S3Content } from '../S3'

const ajv = new Ajv()

export class ItemRouter extends Router {
  itemFilesRequestHandler:
    | ((req: Request, res: Response) => Promise<boolean>) // Promisified RequestHandler
    | undefined

  mount() {
    const withItemExists = withModelExists(Item, 'id')
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
     * Returns the item
     */
    this.router.get(
      '/items/:id',
      withAuthentication,
      server.handleRequest(this.getItem)
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

    const [dbItems, remoteData] = await Promise.all([
      Item.findByEthAddressWithCollection(eth_address),
      collectionAPI.fetchCollectionsAndItemsByOwner(eth_address)
    ])

    const remoteItems = remoteData.items
    const items: ItemAttributes[] = []

    for (const dbItem of dbItems) {
      const index = remoteItems.findIndex(
        item =>
          item.blockchain_item_id === dbItem.blockchain_item_id &&
          item.collection!.contract_address ===
            dbItem.collection.contract_address
      )

      const item = index === -1 ? dbItem : { ...dbItem, ...remoteItems[index] }
      items.push(item)
    }

    return items
  }

  async getItem(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    let dbItem = await Item.findOne<ItemAttributes>({ id })

    if (dbItem && dbItem.blockchain_item_id) {
      const remoteItem = await collectionAPI.fetchItemByBlockchainId(
        dbItem.blockchain_item_id
      )
      dbItem = {
        ...dbItem,
        ...remoteItem
      }
    }

    return dbItem
  }

  async upsertItem(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const itemJSON: any = server.extractFromReq(req, 'item')
    const eth_address = req.auth.ethAddress

    const validator = ajv.compile(itemSchema)
    validator(itemJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const canUpsert = await new Ownable(Item).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new HTTPError(
        'Unauthorized user',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const attributes = {
      ...itemJSON,
      eth_address
    } as ItemAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL item ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    return new Item(attributes).upsert()
  }

  async deleteItem(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
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
        message: error.message
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
