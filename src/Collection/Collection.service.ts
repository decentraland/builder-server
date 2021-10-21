import { collectionAPI } from '../ethereum/api/collection'
import { isPublished } from '../utils/eth'
import { isManager as isTPWManger } from '../ethereum/api/tpw'
import { FactoryCollection } from '../ethereum/FactoryCollection'
import { Ownable } from '../Ownable'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { toDBCollection } from './utils'
import { Collection } from './Collection.model'

export class CollectionLockedException extends Error {
  constructor(public id: string) {
    super("The collection is locked. It can't be saved.")
  }
}

export class CollectionAlreadyPublishedException extends Error {
  constructor(public id: string) {
    super("The collection is published. It can't be saved.")
  }
}

export class WrongCollectionException extends Error {
  constructor(m: string, public data: Record<string, any>) {
    super(m)
  }
}

export class UnauthorizedCollectionEditException extends Error {
  constructor(public id: string, public eth_address: string) {
    super('Unauthorized to upsert collection')
  }
}

export class CollectionService {
  isLockActive(lock: Date | null) {
    console.log('Lock is', lock)
    if (!lock) {
      return false
    }

    const deadline = new Date(lock)
    deadline.setDate(deadline.getDate() + 1)
    console.log('Deadline', deadline, deadline.getTime())
    const now = Date.now()
    console.log('Now is', now)
    console.log('Is locked', deadline.getTime() > now)

    return deadline.getTime() > now
  }

  private async checkIfNameIsValid(id: string, name: string): Promise<void> {
    if (!(await Collection.isValidName(id, name.trim()))) {
      throw new WrongCollectionException('Name already in use', { id, name })
    }
  }

  async upsertDCLCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection,
    data: string
  ): Promise<CollectionAttributes> {
    if (collectionJSON.is_published || collectionJSON.is_approved) {
      throw new WrongCollectionException(
        'Can not change the is_published or is_approved property',
        { id, eth_address }
      )
    }
    console.log('Collection JSON is well formatted')

    const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new UnauthorizedCollectionEditException(id, eth_address)
    }

    console.log('The user can upsert')

    const attributes = toDBCollection({
      ...collectionJSON,
      eth_address,
    })

    await this.checkIfNameIsValid(id, attributes.name)
    console.log('The name is valid')

    const collection = await Collection.findOne<CollectionAttributes>(id)

    console.log(
      'About to check if a collection exists and has a contract address',
      collection,
      collection?.contract_address,
      collection && collection.contract_address
    )
    if (collection && collection.contract_address) {
      console.log("About to check if it's published")
      if (await this.isPublished(collection.contract_address)) {
        throw new CollectionAlreadyPublishedException(id)
      }
      console.log('Collection is not published')

      if (this.isLockActive(collection.lock)) {
        throw new CollectionLockedException(id)
      }
      console.log('The collection is not locked')
    }

    console.log('About to get the salt and the contract address')

    const factoryCollection = new FactoryCollection()
    attributes.salt = factoryCollection.getSalt(id)
    attributes.contract_address = factoryCollection.getContractAddress(
      attributes.salt,
      data
    )

    return new Collection(attributes).upsert()
  }

  async upsertTPWCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection
  ) {
    if (!(await isTPWManger(collectionJSON.urn, eth_address))) {
      throw new UnauthorizedCollectionEditException(id, eth_address)
    }

    const collection = await Collection.findOne<CollectionAttributes>(id)
    if (collection) {
      if (this.isLockActive(collection.lock)) {
        throw new CollectionLockedException(id)
      }
    }

    const attributes = toDBCollection(collectionJSON)
    // Should we do something with the salt and the contract address? There's no need to have them
    return new Collection(attributes).upsert()
  }

  async isPublished(contractAddress: string) {
    console.log('About to fetch for collections')
    const remoteCollection = await collectionAPI.fetchCollection(
      contractAddress
    )
    console.log('Remote collection', remoteCollection)

    // Fallback: check against the blockchain, in case the subgraph is lagging
    if (!remoteCollection) {
      console.log(
        'Remote collection was not sent, check if it is published or not'
      )
      const isCollectionPublished = await isPublished(contractAddress)
      console.log('isCollectionPublished', isCollectionPublished)
      return isCollectionPublished
    }

    console.log('Returning if the collection is published')
    return true
  }
}
