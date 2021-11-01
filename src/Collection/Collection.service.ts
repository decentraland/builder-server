import { collectionAPI } from '../ethereum/api/collection'
import { isPublished } from '../utils/eth'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { FactoryCollection } from '../ethereum/FactoryCollection'
import { Ownable } from '../Ownable'
import { Item } from '../Item/Item.model'
import { isManager } from '../ethereum/api/tpw'
import {
  decodeTPCollectionURN,
  getThirdPartyCollectionURN,
  toDBCollection,
} from './utils'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { Collection } from './Collection.model'

enum CollectionType {
  THIRD_PARTY,
  DCL,
}
export class CollectionLockedException extends Error {
  constructor(public id: string, action: string) {
    super(`The collection is locked. It can't be ${action}.`)
  }
}

export class CollectionAlreadyPublishedException extends Error {
  constructor(public id: string, type: CollectionType, action: string) {
    super(
      type === CollectionType.DCL
        ? `The collection is published. It can't be ${action}.`
        : `The third party collection already has published items. It can't be ${action}.`
    )
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

export class NonExistentCollectionException extends Error {
  constructor(public id: string) {
    super("The collection doesn't exist.")
  }
}

export class CollectionService {
  isLockActive(lock: Date | null) {
    if (!lock) {
      return false
    }

    const deadline = new Date(lock)
    deadline.setDate(deadline.getDate() + 1)

    return deadline.getTime() > Date.now()
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

    const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new UnauthorizedCollectionEditException(id, eth_address)
    }

    const attributes = toDBCollection({
      ...collectionJSON,
      eth_address,
    })

    await this.checkIfNameIsValid(id, attributes.name)

    const collection = await Collection.findOne<CollectionAttributes>(id)

    if (collection && collection.contract_address) {
      if (await this.isPublished(collection.contract_address)) {
        throw new CollectionAlreadyPublishedException(
          id,
          CollectionType.DCL,
          'saved'
        )
      }

      if (this.isLockActive(collection.lock)) {
        throw new CollectionLockedException(id, 'saved')
      }
    }

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
    if (!(await isManager(collectionJSON.urn, eth_address))) {
      throw new UnauthorizedCollectionEditException(id, eth_address)
    }

    const collection = await Collection.findOne<CollectionAttributes>(id)

    if (collection) {
      if (
        collection.third_party_id === null ||
        collection.urn_suffix === null
      ) {
        throw new WrongCollectionException(
          "The collection can't be converted into a third party collection.",
          { id }
        )
      }

      const { third_party_id, urn_suffix } = decodeTPCollectionURN(
        collectionJSON.urn
      )

      if (
        third_party_id !== collection.third_party_id ||
        urn_suffix !== collection.urn_suffix
      ) {
        const collectionItems = await thirdPartyAPI.fetchThirdPartyCollectionItems(
          collection.third_party_id!,
          collection.urn_suffix!
        )
        // We can't change the TPW collection's URN if there are already published items
        if (collectionItems.length > 0) {
          throw new CollectionAlreadyPublishedException(
            id,
            CollectionType.THIRD_PARTY,
            'updated'
          )
        }
      }

      if (this.isLockActive(collection.lock)) {
        throw new CollectionLockedException(id, 'saved')
      }
    }

    const attributes = toDBCollection(collectionJSON)

    // Should we do something with the salt and the contract address? There's no need to have them
    return new Collection(attributes).upsert()
  }

  async isPublished(contractAddress: string) {
    const remoteCollection = await collectionAPI.fetchCollection(
      contractAddress
    )

    // Fallback: check against the blockchain, in case the subgraph is lagging
    if (!remoteCollection) {
      const isCollectionPublished = await isPublished(contractAddress)
      return isCollectionPublished
    }

    return true
  }

  public async deleteCollection(collectionId: string): Promise<void> {
    const collection = await this.getDBCollection(collectionId)
    if (this.isDBCollectionThirdParty(collection)) {
      // If it's a TPC we must check if there's an item already published under that collection urn suffix
      const collectionItems = await thirdPartyAPI.fetchThirdPartyCollectionItems(
        collection.third_party_id!,
        collection.urn_suffix!
      )
      if (collectionItems.length > 0) {
        throw new CollectionAlreadyPublishedException(
          collection.id,
          CollectionType.THIRD_PARTY,
          'deleted'
        )
      }
    } else {
      // If it's a DCL collection, we must check if it was already published
      if (await this.isPublished(collection.contract_address!)) {
        throw new CollectionAlreadyPublishedException(
          collectionId,
          CollectionType.DCL,
          'deleted'
        )
      }
    }
    if (this.isLockActive(collection.lock)) {
      throw new CollectionLockedException(collection.id, 'deleted')
    }
    await Promise.all([
      Collection.delete({ id: collection.id }),
      // TODO: This should eventually be in the item's service
      Item.delete({ collection_id: collection.id }),
    ])
  }

  public async isOwnedOrManagedBy(
    id: string,
    ethAddress: string
  ): Promise<boolean> {
    const collection = await Collection.findOne<CollectionAttributes>(id)
    if (collection && this.isDBCollectionThirdParty(collection)) {
      return isManager(
        getThirdPartyCollectionURN(
          collection.third_party_id!,
          collection.urn_suffix!
        ),
        ethAddress
      )
    } else if (collection) {
      return collection.eth_address === ethAddress
    }

    return false
  }

  private async getDBCollection(
    collectionId: string
  ): Promise<CollectionAttributes> {
    const collection = await Collection.findOne(collectionId)
    if (!collection) {
      throw new NonExistentCollectionException(collectionId)
    }

    return collection
  }

  private isDBCollectionThirdParty(collection: CollectionAttributes): boolean {
    return !!collection.urn_suffix && !!collection.third_party_id
  }
}
