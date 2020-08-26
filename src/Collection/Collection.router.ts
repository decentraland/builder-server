import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { Ownable } from '../Ownable'
import { FactoryCollection } from '../ethereum'
import { Collection, CollectionAttributes } from '../Collection'
import { collectionSchema } from './Collection.types'

const ajv = new Ajv()

export class CollectionRouter extends Router {
  mount() {
    const withCollectionExists = withModelExists(Collection, 'id')
    const withCollectionAuthorization = withModelAuthorization(Collection)

    /**
     * Returns the collections for a user
     */
    this.router.get(
      '/collections',
      withAuthentication,
      server.handleRequest(this.getCollections)
    )

    /**
     * Returns a collection for a user
     */
    this.router.get(
      '/collections/:id',
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.getCollection)
    )

    /**
     * Upserts the collection
     */
    this.router.put(
      '/collections/:id',
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.upsertCollection)
    )
  }

  async getCollections(req: AuthRequest) {
    const eth_address = req.auth.ethAddress
    return Collection.find({ eth_address })
  }

  async getCollection(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return Collection.findOne({ id })
  }

  async upsertCollection(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const collectionJSON: any = server.extractFromReq(req, 'collection')
    const eth_address = req.auth.ethAddress

    const validator = ajv.compile(collectionSchema)
    validator(collectionJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new HTTPError(
        'Unauthorized user',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const attributes = {
      ...collectionJSON,
      eth_address
    } as CollectionAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL collection ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    const factoryCollection = new FactoryCollection()
    attributes.salt = factoryCollection.getSalt(id)
    attributes.contract_address = factoryCollection.getContractAddress(
      attributes.salt!,
      attributes.eth_address
    )

    return new Collection(attributes).upsert()
  }
}
