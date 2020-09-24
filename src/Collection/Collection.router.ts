import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest
} from '../middleware'
import { Ownable } from '../Ownable'
import { collectionAPI } from '../ethereum/api/collection'
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
      // withAuthentication,
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
     * Important! Collection authorization is done inside the handler
     */
    this.router.put(
      '/collections/:id',
      withAuthentication,
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

  async getCollections(req: AuthRequest) {
    const eth_address = req.auth.ethAddress

    const [dbCollections, remoteCollections] = await Promise.all([
      Collection.find<CollectionAttributes>({ eth_address }),
      collectionAPI.fetchCollectionsByOwner(eth_address)
    ])

    const collections: CollectionAttributes[] = []
    const remoteAddresses = remoteCollections.map(
      collection => collection.contract_address
    )

    for (const dbCollection of dbCollections) {
      if (!dbCollection.eth_address) {
        collections.push(dbCollection)
        continue
      }

      const index = remoteAddresses.indexOf(dbCollection.contract_address)
      if (index === -1) {
        continue
      } else {
        const remoteCollection = remoteCollections[index]
        collections.push({
          ...dbCollection,
          ...remoteCollection
        })
      }
    }

    return collections
  }

  async getCollection(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return Collection.findOne({ id })
  }

  async upsertCollection(req: AuthRequest) {
    try {
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

      await new Collection(attributes).upsert()
    } catch (error) {
      throw error
    }
  }

  async deleteCollection(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    await Collection.delete({ id })
    return true
  }
}
