import { ethers } from 'ethers'
import { v4 as uuid } from 'uuid'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ItemFragment, ThirdPartyFragment } from '../ethereum/api/fragments'
import { FactoryCollection } from '../ethereum/FactoryCollection'
import { Bridge } from '../ethereum/api/Bridge'
import { isPublished } from '../utils/eth'
import { InvalidRequestError } from '../utils/errors'
import { Ownable } from '../Ownable'
import { FullItem, Item, ItemAttributes } from '../Item'
import { UnpublishedItemError } from '../Item/Item.errors'
import { ItemCuration, ItemCurationAttributes } from '../Curation/ItemCuration'
import { SlotUsageCheque, SlotUsageChequeAttributes } from '../SlotUsageCheque'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from '../Curation/CollectionCuration'
import { CurationStatus } from '../Curation'
import { decodeTPCollectionURN, isTPCollection, toDBCollection } from './utils'
import {
  CollectionAttributes,
  FullCollection,
  PublishCheque,
  ThirdPartyCollectionAttributes,
} from './Collection.types'
import { Collection } from './Collection.model'
import {
  CollectionAction,
  AlreadyPublishedCollectionError,
  LockedCollectionError,
  CollectionType,
  NonExistentCollectionError,
  UnauthorizedCollectionEditError,
  WrongCollectionError,
  UnpublishedCollectionError,
} from './Collection.errors'

export class CollectionService {
  /**
   * Main Methods
   */

  public async getCollection(id: string): Promise<CollectionAttributes> {
    const dbCollection = await this.getDBCollection(id)

    return isTPCollection(dbCollection)
      ? this.getTPCollection(dbCollection)
      : this.getDCLCollection(dbCollection)
  }

  public async deleteCollection(collectionId: string): Promise<void> {
    const collection = await this.getDBCollection(collectionId)

    if (isTPCollection(collection)) {
      await this.checkIfThirdPartyCollectionHasPublishedItems(
        collection.id,
        CollectionAction.DELETE
      )
    } else {
      // If it's a DCL collection, we must check if it was already published
      if (await this.isDCLPublished(collection.contract_address!)) {
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

  public async publishDCLCollection(
    dbCollection: CollectionAttributes,
    dbItems: ItemAttributes[]
  ) {
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection!.contract_address!
    )

    if (!remoteCollection) {
      // This might be a problem with the graph lagging but we delegate the retry logic on the client
      throw new UnpublishedCollectionError(dbCollection.id)
    }

    const items: ItemAttributes[] = [...dbItems]
    let remoteItems: ItemFragment[] = []

    const isMissingBlockchainItemIds = dbItems.some(
      (item) => item.blockchain_item_id == null
    )

    if (isMissingBlockchainItemIds) {
      remoteItems = await collectionAPI.fetchItemsByContractAddress(
        dbCollection!.contract_address!
      )

      const updates = []

      for (const [index, item] of items.entries()) {
        const remoteItem = remoteItems.find(
          (remoteItem) => Number(remoteItem.blockchainId) === index
        )
        if (!remoteItem) {
          throw new UnpublishedItemError(item.id)
        }

        items[index].blockchain_item_id = remoteItem.blockchainId
        updates.push(
          Item.update(
            { blockchain_item_id: remoteItem.blockchainId },
            { id: item.id }
          )
        )
      }

      await Promise.all(updates)
    }

    return {
      collection: Bridge.mergeCollection(dbCollection!, remoteCollection),
      items: await Bridge.consolidateItems(items, remoteItems),
    }
  }

  /**
   * Publishes a TP collection by storing the slots cheque and creating the curations for the items to be published.
   * It creates or updates the virtual CollectionCuration for the items
   * @param dbCollection - Database TP collection
   * @param dbItems - Database TP items that belong to the collection
   * @param signedMessage - The message we signed
   * @param signature - The signature resulted from signing the message
   */
  public async publishTPCollection(
    dbCollection: ThirdPartyCollectionAttributes,
    dbItems: ItemAttributes[],
    cheque: PublishCheque
  ): Promise<{
    collection: CollectionAttributes
    items: FullItem[]
  }> {
    // For DCL collections, once a published collection item changes, the PUSH CHANGES button appears
    // That will fire a /collections/${collectionId}/curation which will create a new CollectionCuration
    // Subsequent changes will not show the push changes button, as it's already under_review

    // For TP items, curations always exist. PUSH CHANGES should appear if the item has an approved ItemCuration and has changes in the Catalyst
    // That should fire /items/:id/curation for each item that changed

    // There'll always be a publish before a PUSH CHANGES, so this method also creates or updates the virtual CollectionCuration for the items

    const { signedMessage, signature, qty, salt } = cheque

    if (dbItems.length === 0) {
      throw new InvalidRequestError('Tried to publish no TP items')
    }

    try {
      ethers.utils.verifyMessage(signedMessage, signature) // Throws if invalid
    } catch (error) {
      throw new InvalidRequestError(
        'Tried to publish TP items with an invalid signed message or signature'
      )
    }

    const collectionId = dbCollection.id
    const allTheSameCollection = dbItems.every(
      (item) => item.collection_id === collectionId
    )
    if (!allTheSameCollection) {
      throw new InvalidRequestError(
        'Cannot publish items that belong to different collections'
      )
    }

    const isPublished = await ItemCuration.findLastCreatedByCollectionIdAndStatus(
      collectionId,
      CurationStatus.PENDING
    )
    if (isPublished) {
      throw new AlreadyPublishedCollectionError(
        collectionId,
        CollectionType.THIRD_PARTY,
        CollectionAction.UPDATE
      )
    }

    const now = new Date()
    await SlotUsageCheque.create<SlotUsageChequeAttributes>({
      id: uuid(),
      signature,
      qty,
      salt,
      collection_id: dbCollection.id,
      third_party_id: dbCollection.third_party_id,
      created_at: now,
      updated_at: now,
    })

    const promises = []
    for (const item of dbItems) {
      promises.push(
        ItemCuration.create<ItemCurationAttributes>({
          id: uuid(),
          item_id: item.id,
          status: CurationStatus.PENDING,
          created_at: now,
          updated_at: now,
        })
      )
    }
    const itemCurations = await Promise.all(promises)
    const [lastItemCuration] = itemCurations.slice(-1)

    const collectionCuration = await CollectionCuration.findOne(collectionId)
    if (collectionCuration) {
      await CollectionCuration.update(
        { id: collectionCuration.id },
        { updated_at: now }
      )
    } else {
      await CollectionCuration.create<CollectionCurationAttributes>({
        id: uuid(),
        collection_id: collectionId,
        status: CurationStatus.PENDING,
        created_at: now,
        updated_at: now,
      })
    }

    return {
      collection: Bridge.mergeTPCollection(dbCollection, lastItemCuration),
      items: await Bridge.consolidateTPItems(dbItems, itemCurations),
    }
  }

  public async upsertDCLCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection,
    data: string
  ): Promise<CollectionAttributes> {
    if (!data) {
      throw new WrongCollectionError(
        'Cannot upsert a collection without a valid data',
        { id, eth_address }
      )
    }

    if (collectionJSON.is_published || collectionJSON.is_approved) {
      throw new WrongCollectionError(
        'Cannot change the is_published or is_approved property',
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
      if (await this.isDCLPublished(collection.contract_address)) {
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

  public async upsertTPCollection(
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
        // We can't change the TP collection's URN if there are already published items
        await this.checkIfThirdPartyCollectionHasPublishedItems(id)

        // Check if the new URN for the collection already exists
        await this.checkIfThirdPartyCollectionURNExists(
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
      await this.checkIfThirdPartyCollectionURNExists(
        id,
        third_party_id,
        urn_suffix
      )
    }

    const attributes = toDBCollection(collectionJSON)

    // Should we do something with the salt and the contract address? There's no need to have them
    return new Collection(attributes).upsert()
  }

  /**
   * Helpers
   */

  public isLockActive(lock: Date | null) {
    if (!lock) {
      return false
    }

    const deadline = new Date(lock)
    deadline.setDate(deadline.getDate() + 1)

    return deadline.getTime() > Date.now()
  }

  public async isDCLPublished(contractAddress: string) {
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

  public async getDbTPCollections(): Promise<CollectionAttributes[]> {
    const thirdParties = await thirdPartyAPI.fetchThirdParties()
    return this.getDbTPCollectionsByThirdParties(thirdParties)
  }

  public async getDbTPCollectionsByManager(
    manager: string
  ): Promise<CollectionAttributes[]> {
    const thirdParties = await thirdPartyAPI.fetchThirdPartiesByManager(manager)
    return this.getDbTPCollectionsByThirdParties(thirdParties)
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

  /**
   * Private methods
   */

  private async getDbTPCollectionsByThirdParties(
    thirdParties: ThirdPartyFragment[]
  ): Promise<CollectionAttributes[]> {
    if (thirdParties.length <= 0) {
      return []
    }
    const thirdPartyIds = thirdParties.map((thirdParty) => thirdParty.id)

    return Collection.findByThirdPartyIds(thirdPartyIds)
  }

  private async getTPCollection(
    dbCollection: ThirdPartyCollectionAttributes
  ): Promise<CollectionAttributes> {
    const lastItemCuration = await ItemCuration.findLastByCollectionId(
      dbCollection.id
    )
    return lastItemCuration
      ? Bridge.mergeTPCollection(dbCollection, lastItemCuration)
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
    action = CollectionAction.UPSERT
  ): Promise<void> {
    if (await ItemCuration.existsByCollectionId(id)) {
      throw new AlreadyPublishedCollectionError(
        id,
        CollectionType.THIRD_PARTY,
        action
      )
    }
  }

  private async checkIfThirdPartyCollectionURNExists(
    id: string,
    third_party_id: string,
    urn_suffix: string,
    action = CollectionAction.UPSERT
  ): Promise<void> {
    if (await Collection.isURNRepeated(id, third_party_id, urn_suffix)) {
      throw new AlreadyPublishedCollectionError(
        id,
        CollectionType.THIRD_PARTY,
        action
      )
    }
  }
}
