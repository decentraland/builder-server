import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ThirdPartyFragment } from '../ethereum/api/fragments'
import { FactoryCollection } from '../ethereum/FactoryCollection'
import { Bridge } from '../ethereum/api/Bridge'
import { isPublished } from '../utils/eth'
import { Ownable } from '../Ownable'
import { Item } from '../Item'
import { decodeTPCollectionURN, isTPCollection, toDBCollection } from './utils'
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
import { ThirdPartyCollectionAttributes } from '.'

export class CollectionService {
  public isLockActive(lock: Date | null) {
    if (!lock) {
      return false
    }

    const deadline = new Date(lock)
    deadline.setDate(deadline.getDate() + 1)

    return deadline.getTime() > Date.now()
  }

  public async upsertDCLCollection(
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

      // Check that the given collection belongs to a manageable third party
      if (
        !(await thirdPartyAPI.isManager(
          collection.third_party_id!,
          eth_address
        ))
      ) {
        throw new UnauthorizedCollectionEditError(id, eth_address)
      }

      // If the urn suffix is different, the collection's URN is being changed.
      if (urn_suffix !== collection.urn_suffix) {
        // We can't change the TPW collection's URN if there are already published items
        await this.checkIfThirdPartyCollectionHasPublishedItems(
          id,
          collection.third_party_id!,
          collection.urn_suffix!
        )

        // Check if the new URN for the collection already exists
        await this.checkIfThirdPartyCollectionHasPublishedItems(
          id,
          collection.third_party_id!,
          urn_suffix
        )
      }
      if (this.isLockActive(collection.lock)) {
        throw new LockedCollectionError(id, CollectionAction.UPDATE)
      }
    } else {
      // Check that the given third party id is manageable by the user
      if (!(await thirdPartyAPI.isManager(third_party_id, eth_address))) {
        throw new UnauthorizedCollectionEditError(id, eth_address)
      }

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
      return thirdPartyAPI.isManager(collection.third_party_id!, ethAddress)
    } else if (collection) {
      return collection.eth_address === ethAddress
    }

    return false
  }

  // TODO: rename by getDbTPCollectionsByThirdParties?
  public async getDbTPCollections(
    thirdParties: ThirdPartyFragment[]
  ): Promise<CollectionAttributes[]> {
    if (thirdParties.length <= 0) {
      return []
    }
    const thirdPartyIds = thirdParties.map((thirdParty) => thirdParty.id)

    return Collection.findByThirdPartyIds(thirdPartyIds)
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

  public async getCollection(id: string): Promise<CollectionAttributes> {
    const dbCollection = await this.getDBCollection(id)

    return isTPCollection(dbCollection)
      ? this.getTPCollection(dbCollection)
      : this.getDCLCollection(dbCollection)
  }

  private async getTPCollection(
    dbCollection: ThirdPartyCollectionAttributes
  ): Promise<CollectionAttributes> {
    const {
      thirdParty,
      item,
    } = await thirdPartyAPI.fetchThirdPartyWithLastItem(
      dbCollection.third_party_id,
      dbCollection.urn_suffix
    )
    return thirdParty
      ? Bridge.mergeTPCollection(dbCollection, thirdParty, item)
      : dbCollection
  }

  private async getDCLCollection(
    dbCollection: CollectionAttributes
  ): Promise<CollectionAttributes> {
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection.contract_address!
    )

    return remoteCollection
      ? Bridge.mergeCollection(dbCollection, remoteCollection)
      : dbCollection
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
}
