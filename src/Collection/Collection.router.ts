import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  withLowercasedParams,
  AuthRequest
} from '../middleware'
import { collectionAPI } from '../ethereum/api/collection'
import { Bridge } from '../ethereum/api/Bridge'
import { FactoryCollection } from '../ethereum'
import { Ownable } from '../Ownable'
import { Item } from '../Item'
import { Collection, CollectionAttributes } from '../Collection'
import { isCommitteeMember } from '../Committee'
import { collectionSchema } from './Collection.types'
import { RequestParameters } from '../RequestParameters'
import { hasAccess } from './access'
import { isPublished } from '../utils/eth'

const validator = getValidator()

export class CollectionRouter extends Router {
  mount() {
    const withCollectionExists = withModelExists(Collection, 'id')
    const withCollectionAuthorization = withModelAuthorization(Collection)
    const withLowercasedAddress = withLowercasedParams(['address'])

    /**
     * Returns all collections
     */
    this.router.get(
      '/collections',
      withAuthentication,
      server.handleRequest(this.getCollections)
    )

    /**
     * Returns the collections for an address
     */
    this.router.get(
      '/:address/collections',
      withAuthentication,
      withLowercasedAddress,
      server.handleRequest(this.getAddressCollections)
    )

    /**
     * Returns a collection
     */
    this.router.get(
      '/collections/:id',
      withAuthentication,
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
    const canRequestCollections = await isCommitteeMember(eth_address)

    if (!canRequestCollections) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    let is_published: boolean | undefined
    try {
      is_published = new RequestParameters(req).getBoolean('isPublished')
    } catch (error) {
      // No is_published param
    }

    // The current implementation only supports fetching published/unpublished collections and items
    // If, in the future we need to add multiple query params, a more flexible implementation is required
    const [dbCollections, remoteCollections] = await Promise.all([
      typeof is_published === 'undefined'
        ? Collection.find<CollectionAttributes>()
        : Collection.find<CollectionAttributes>({ is_published }),
      collectionAPI.fetchCollections()
    ])

    return Bridge.consolidateCollections(dbCollections, remoteCollections)
  }

  async getAddressCollections(req: AuthRequest) {
    const eth_address = server.extractFromReq(req, 'address')
    const auth_address = req.auth.ethAddress

    if (eth_address !== auth_address) {
      throw new HTTPError(
        'Unauthorized',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const [dbCollections, remoteCollections] = await Promise.all([
      Collection.find<CollectionAttributes>({ eth_address }),
      collectionAPI.fetchCollectionsByAuthorizedUser(eth_address)
    ])
    return Bridge.consolidateCollections(dbCollections, remoteCollections)
  }

  async getCollection(req: AuthRequest) {
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

    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection.contract_address
    )

    const fullCollection = remoteCollection
      ? Bridge.mergeCollection(dbCollection, remoteCollection)
      : dbCollection

    if (!(await hasAccess(eth_address, fullCollection))) {
      throw new HTTPError(
        'Unauthorized',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    return fullCollection
  }

  upsertCollection = async (req: AuthRequest) => {
    try {
      const id = server.extractFromReq(req, 'id')
      const collectionJSON: any = server.extractFromReq(req, 'collection')
      const data: string = server.extractFromReq(req, 'data')
      const eth_address = req.auth.ethAddress

      const validate = validator.compile(collectionSchema)
      validate(collectionJSON)

      if (validate.errors) {
        throw new HTTPError('Invalid schema', validate.errors)
      }

      if (collectionJSON.is_published || collectionJSON.is_approved) {
        throw new HTTPError(
          'Can not change is_published or is_approved property',
          { id, eth_address },
          STATUS_CODES.unauthorized
        )
      }

      const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
      if (!canUpsert) {
        throw new HTTPError(
          'Unauthorized',
          { id, eth_address },
          STATUS_CODES.unauthorized
        )
      }

      const attributes = {
        ...collectionJSON,
        eth_address
      } as CollectionAttributes

      if (!(await Collection.isValidName(id, attributes.name.trim()))) {
        throw new HTTPError(
          'Name already in use',
          { id, name: attributes.name },
          STATUS_CODES.unauthorized
        )
      }

      if (await this.isCollectionPublished(id)) {
        throw new HTTPError(
          "The collection is published. It can't be updated",
          { id },
          STATUS_CODES.unauthorized
        )
      }

      if (id !== attributes.id) {
        throw new HTTPError('The body and URL collection ids do not match', {
          urlId: id,
          bodyId: attributes.id
        })
      }

      const factoryCollection = new FactoryCollection()
      attributes.salt = factoryCollection.getSalt(id)
      attributes.contract_address = factoryCollection.getContractAddress(
        attributes.salt,
        data
      )

      return new Collection(attributes).upsert()
    } catch (error) {
      throw error
    }
  }

  deleteCollection = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')

    if (await this.isCollectionPublished(id)) {
      throw new HTTPError(
        "The collection is published. It can't be deleted",
        { id },
        STATUS_CODES.unauthorized
      )
    }

    await Promise.all([
      Collection.delete({ id }),
      Item.delete({ collection_id: id })
    ])
    return true
  }

  async isCollectionPublished(collectionId: string) {
    const dbCollection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )

    if (!dbCollection) {
      return false
    }

    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection.contract_address
    )

    // Fallback: check against the blockchain, in case the subgraph is lagging
    if (!remoteCollection) {
      const result = await isPublished(dbCollection.contract_address)
      if (!result) {
        return false
      }
    }

    return true
  }
}
