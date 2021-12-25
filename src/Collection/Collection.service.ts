import { env } from 'decentraland-commons'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { isPublished } from '../utils/eth'
import { FactoryCollection } from '../ethereum/FactoryCollection'
import { Ownable } from '../Ownable'
import { Item } from '../Item/Item.model'
import {
  decodeTPCollectionURN,
  getThirdPartyCollectionURN,
  isTPCollection,
  toDBCollection,
} from './utils'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { Collection } from './Collection.model'
import {
  CollectionAction,
  AlreadyPublishedCollectionError,
  LockedCollectionError,
  CollectionType,
  NonExistentCollectionError,
  UnauthorizedCollectionEditError,
  WrongCollectionError,
} from './Collection.errors'

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
      throw new WrongCollectionError('Name already in use', { id, name })
    }
  }

  private async checkIfThirdPartyCollectionHasPublishedItems(
    id: string,
    thirdPartyId: string,
    collectionUrnSuffix: string
  ): Promise<void> {
    const isPublished = await thirdPartyAPI.isPublished(
      thirdPartyId,
      collectionUrnSuffix
    )

    // We can't change the TPW collection's URN if there are already published items
    if (isPublished) {
      throw new AlreadyPublishedCollectionError(
        id,
        CollectionType.THIRD_PARTY,
        CollectionAction.UPSERT
      )
    }
  }

  async upsertDCLCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection,
    data: string
  ): Promise<CollectionAttributes> {
    if (collectionJSON.is_published || collectionJSON.is_approved) {
      throw new WrongCollectionError(
        'Can not change the is_published or is_approved property',
        { id, eth_address }
      )
    }

    const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new UnauthorizedCollectionEditError(id, eth_address)
    }

    const attributes = toDBCollection({
      ...collectionJSON,
      eth_address,
    })

    await this.checkIfNameIsValid(id, attributes.name)

    const collection = await Collection.findOne<CollectionAttributes>(id)

    if (collection && collection.contract_address) {
      if (await this.isPublished(collection.contract_address)) {
        throw new AlreadyPublishedCollectionError(
          id,
          CollectionType.DCL,
          CollectionAction.UPDATE
        )
      }

      if (this.isLockActive(collection.lock)) {
        throw new LockedCollectionError(id, CollectionAction.UPDATE)
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
    if (collectionJSON.urn === null) {
      throw new WrongCollectionError(
        'Invalid empty URN for third party collection',
        { id, eth_address, urn: collectionJSON.urn }
      )
    }

    if (!(await this.isTPWManager(collectionJSON.urn, eth_address))) {
      throw new UnauthorizedCollectionEditError(id, eth_address)
    }

    const { third_party_id, urn_suffix } = decodeTPCollectionURN(
      collectionJSON.urn
    )
    const collection = await Collection.findOne<CollectionAttributes>(id)

    if (collection) {
      if (!isTPCollection(collection)) {
        throw new WrongCollectionError(
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
        // We can't change the TPW collection's URN if there are already published items
        await this.checkIfThirdPartyCollectionHasPublishedItems(
          id,
          collection.third_party_id!,
          collection.urn_suffix!
        )
        // Check if the new URN for the collection already exists
        await this.checkIfThirdPartyCollectionHasPublishedItems(
          id,
          third_party_id,
          urn_suffix
        )
      }
      if (this.isLockActive(collection.lock)) {
        throw new LockedCollectionError(id, CollectionAction.UPDATE)
      }
    } else {
      // Check if the URN for the new collection already exists
      await this.checkIfThirdPartyCollectionHasPublishedItems(
        id,
        third_party_id,
        urn_suffix
      )
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
    if (isTPCollection(collection)) {
      // If it's a TPC we must check if there's an item already published under that collection urn suffix
      const isPublished = await thirdPartyAPI.isPublished(
        collection.third_party_id,
        collection.urn_suffix
      )
      if (isPublished) {
        throw new AlreadyPublishedCollectionError(
          collection.id,
          CollectionType.THIRD_PARTY,
          CollectionAction.DELETE
        )
      }
    } else {
      // If it's a DCL collection, we must check if it was already published
      if (await this.isPublished(collection.contract_address!)) {
        throw new AlreadyPublishedCollectionError(
          collectionId,
          CollectionType.DCL,
          CollectionAction.DELETE
        )
      }
    }
    if (this.isLockActive(collection.lock)) {
      throw new LockedCollectionError(collection.id, CollectionAction.DELETE)
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
    if (collection && isTPCollection(collection)) {
      return this.isTPWManager(
        getThirdPartyCollectionURN(
          collection.third_party_id,
          collection.urn_suffix
        ),
        ethAddress
      )
    } else if (collection) {
      return collection.eth_address === ethAddress
    }

    return false
  }

  /**
   * Checks if an address manages a third party wearable collection.
   *
   * @param urn - The URN of the TWP collection where to get the information about the collection.
   * @param address - The address to check if it manages the collection.
   */
  public async isTPWManager(urn: string, address: string): Promise<boolean> {
    const isEnvManager =
      !env.isProduction() &&
      env
        .get('TPW_MANAGER_ADDRESSES', '')
        .toLowerCase()
        .search(address.toLowerCase()) > -1

    if (isEnvManager) {
      return true
    }

    return thirdPartyAPI.isManager(urn, address)
  }

  public async getDbTPWCollections(
    manager: string
  ): Promise<CollectionAttributes[]> {
    const thirdPartyIds = await thirdPartyAPI.fetchThirdPartyIds(manager)
    if (thirdPartyIds.length <= 0) {
      return []
    }

    const dbThridPartyCollections = await Collection.findByThirdPartyIds(
      thirdPartyIds
    )
    return dbThridPartyCollections.map((collection) => ({
      ...collection,
      eth_address: manager,
    }))
  }

  public async getDBCollection(
    collectionId: string
  ): Promise<CollectionAttributes> {
    const collection = await Collection.findOne(collectionId)
    if (!collection) {
      throw new NonExistentCollectionError(collectionId)
    }

    return collection
  }
}
