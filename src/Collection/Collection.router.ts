import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
} from '../middleware'
import { collectionAPI } from '../ethereum/api/collection'
import { Bridge } from '../ethereum/api/Bridge'
import { FactoryCollection } from '../ethereum'
import { Ownable } from '../Ownable'
import { Item } from '../Item'
import { Collection, CollectionAttributes } from '../Collection'
import { collectionSchema } from './Collection.types'

const validator = getValidator()

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
     * Returns a collection
     */
    this.router.get(
      '/collections/:id',
      withCollectionExists,
      server.handleRequest(this.getCollection)
    )

    /**
     * Upserts the collection
     * Important! Collection authorization is done inside the handler
     */
    this.router.put(
      '/collections/:id',
      withAuthentication,
      server.handleRequest(this.upsertCollection.bind(this))
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

  async getCollections(req: AuthRequest) {
    const eth_address = req.auth.ethAddress

    const [dbCollections, remoteCollections] = await Promise.all([
      Collection.findByEthAddress(eth_address),
      collectionAPI.fetchCollectionsByOwner(eth_address),
    ])
    return Bridge.consolidateCollections(dbCollections, remoteCollections)
  }

  async getCollection(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    const dbCollection = await Collection.findOne<CollectionAttributes>(id)

    if (dbCollection) {
      const remoteCollection = await collectionAPI.fetchCollection(
        dbCollection.contract_address
      )
      if (remoteCollection) {
        return Bridge.mergeCollection(dbCollection, remoteCollection)
      }
    }

    return dbCollection
  }

  async upsertCollection(req: AuthRequest) {
    try {
      const id = server.extractFromReq(req, 'id')
      const collectionJSON: any = server.extractFromReq(req, 'collection')
      const eth_address = req.auth.ethAddress

      const validate = validator.compile(collectionSchema)
      validate(collectionJSON)

      if (validate.errors) {
        throw new HTTPError('Invalid schema', validate.errors)
      }

      const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
      if (!canUpsert) {
        throw new HTTPError(
          'Unauthorized user',
          { id, eth_address },
          STATUS_CODES.unauthorized
        )
      }

      if (!(await this.isCollectionNameAvailable(collectionJSON))) {
        throw new HTTPError(
          'Name already in use',
          { id, name: collectionJSON.name },
          STATUS_CODES.unauthorized
        )
      }

      const attributes = {
        ...collectionJSON,
        eth_address,
      } as CollectionAttributes

      if (id !== attributes.id) {
        throw new HTTPError('The body and URL collection ids do not match', {
          urlId: id,
          bodyId: attributes.id,
        })
      }

      const factoryCollection = new FactoryCollection()
      attributes.salt = factoryCollection.getSalt(id)
      attributes.contract_address = factoryCollection.getContractAddress(
        attributes.salt,
        attributes.eth_address
      )

      return new Collection(attributes).upsert()
    } catch (error) {
      throw error
    }
  }

  async deleteCollection(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    await Promise.all([
      Collection.delete({ id }),
      Item.delete({ collection_id: id }),
    ])
    return true
  }

  async isCollectionNameAvailable(collection: CollectionAttributes) {
    const dbCollection = await Collection.findByName(collection.name.trim())

    return dbCollection.length === 0
  }
}
