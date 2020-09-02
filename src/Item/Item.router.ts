import { Request } from 'express'
import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { Ownable } from '../Ownable'
import { Item, ItemAttributes } from '../Item'
import { Collection } from '../Collection'
import { itemSchema } from './Item.types'
import { S3Item, getFileUploader, ACL } from '../S3'

const ajv = new Ajv()

export class ItemRouter extends Router {
  mount() {
    const withItemExists = withModelExists(Item, 'id')
    const withItemAuthorization = withModelAuthorization(Item)
    const withCollectionAuthorization = withModelAuthorization(Collection)

    /**
     * Returns the items for a user
     */
    this.router.get(
      '/items',
      withAuthentication,
      server.handleRequest(this.getItems)
    )

    /**
     * Returns the collection items for a user
     */
    this.router.get(
      '/collections/:id/items',
      withAuthentication,
      withCollectionAuthorization,
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
    return Item.find({ eth_address })
  }

  async getCollectionItems(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return Item.find({ collection_id: id })
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

  uploadItemFiles = async (req: Request) => {
    const id = server.extractFromReq(req, 'id')
    try {
      const uploader = getFileUploader({ acl: ACL.publicRead }, (_, file) => {
        console.log(file)
        console.log(file.fieldname)
        return new S3Item(id).getFileKey(file.fieldname)
      })
      console.log('pre')
      const res = await utils.promisify<boolean>(uploader.any())
      console.log('post')
      return res
    } catch (error) {
      console.log('errorrororo', error.message)
      try {
        await Promise.all([Item.delete({ id }), new S3Item(id).delete()])
      } catch (error) {
        // Skip
        console.log('skip')
      }

      throw new HTTPError('An error occurred trying to upload item files', {
        message: error.message
      })
    }
  }
}
