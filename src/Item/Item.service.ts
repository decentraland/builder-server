import {
  Collection,
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
} from '../Collection'
import { CollectionService } from '../Collection/Collection.service'
import { isTPCollection } from '../Collection/utils'
import { CurationStatus } from '../Curation'
import { ItemCuration } from '../Curation/ItemCuration'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { peerAPI } from '../ethereum/api/peer'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Ownable } from '../Ownable'
import { buildModelDates } from '../utils/dates'
import {
  CollectionForItemLockedError,
  ItemAction,
  NonExistentItemError,
  InconsistentItemError,
  DCLItemAlreadyPublishedError,
  ThirdPartyItemAlreadyPublishedError,
  ItemCantBeMovedFromCollectionError,
  UnauthorizedToUpsertError,
  UnauthorizedToChangeToCollectionError,
  InvalidItemURNError,
} from './Item.errors'
import { Item } from './Item.model'
import {
  FullItem,
  ItemAttributes,
  ThirdPartyItemAttributes,
} from './Item.types'
import {
  buildTPItemURN,
  getDecentralandItemURN,
  decodeThirdPartyItemURN,
  isTPItem,
  toDBItem,
} from './utils'

export class ItemService {
  private collectionService = new CollectionService()

  /**
   * Updates or insert an item, either a third party item or a decentraland item.
   *
   * @param item - The item to be updated or inserted.
   * @param eth_address - The item in the DB to be updated or inserted.
   */
  public async upsertItem(
    item: FullItem,
    eth_address: string
  ): Promise<FullItem> {
    let dbCollection: CollectionAttributes | undefined = undefined
    const dbItem = await Item.findOne<ItemAttributes>(item.id)
    if (dbItem) {
      // Moving items between collections is forbidden
      this.checkItemIsMovedToAnotherCollection(item, dbItem)
    }

    const collectionId: string | null =
      dbItem?.collection_id ?? item.collection_id
    if (collectionId) {
      dbCollection = await this.collectionService.getDBCollection(collectionId)
    }

    // Set the item dates
    item = { ...item, ...buildModelDates(dbItem?.created_at) }

    // An item is a third party item if it's current collection or the collection
    // that is going to be inserted into is a third party collection.
    if (dbCollection && isTPCollection(dbCollection)) {
      return this.upsertThirdPartyItem(item, dbItem, dbCollection, eth_address)
    } else {
      return this.upsertDCLItem(item, dbItem, dbCollection, eth_address)
    }
  }

  public async deleteItem(id: string): Promise<void> {
    const dbItem = await Item.findOne<ItemAttributes>(id)
    if (!dbItem) {
      throw new NonExistentItemError(id)
    }

    if (isTPItem(dbItem)) {
      await this.deleteThirdPartyItem(dbItem)
    } else {
      await this.deleteDCLItem(dbItem)
    }
  }

  public async isOwnedOrManagedBy(
    id: string,
    ethAddress: string
  ): Promise<boolean> {
    const dbItem = await Item.findOne<ItemAttributes>(id)
    if (!dbItem) {
      return false
    } else if (isTPItem(dbItem)) {
      return this.collectionService.isOwnedOrManagedBy(
        dbItem.collection_id,
        ethAddress
      )
    } else {
      return dbItem.eth_address === dbItem.eth_address
    }
  }

  public async getItem(
    id: string
  ): Promise<{ item: FullItem; collection?: CollectionAttributes }> {
    const dbItem = await Item.findOne<ItemAttributes>(id)
    if (!dbItem) {
      throw new NonExistentItemError(id)
    }

    return isTPItem(dbItem) ? this.getTPItem(dbItem) : this.getDCLItem(dbItem)
  }

  public async getCollectionItems(
    collectionId: string
  ): Promise<{ collection: CollectionAttributes; items: FullItem[] }> {
    const dbCollection = await this.collectionService.getDBCollection(
      collectionId
    )
    const dbItems = await Item.find<ItemAttributes>({
      collection_id: collectionId,
    })

    return isTPCollection(dbCollection)
      ? this.getTPCollectionItems(dbCollection, dbItems)
      : this.getDCLCollectionItems(dbCollection, dbItems)
  }

  public async getTPItemsByManager(manager: string): Promise<ItemAttributes[]> {
    const thirdParties = await thirdPartyAPI.fetchThirdPartiesByManager(manager)
    if (thirdParties.length <= 0) {
      return []
    }

    const thirdPartyIds = thirdParties.map((thirdParty) => thirdParty.id)

    return Item.findByThirdPartyIds(thirdPartyIds)
  }

  /**
   * Takes a list of items and returns an object containing two sets, one of standard items and the other of TP items
   * @param allItems - Items to split, can be any combination of item types
   */
  public splitItems(
    allItems: ItemAttributes[]
  ): { items: ItemAttributes[]; tpItems: ItemAttributes[] } {
    const items: ItemAttributes[] = []
    const tpItems: ItemAttributes[] = []

    for (const item of allItems) {
      if (isTPItem(item)) {
        tpItems.push(item)
      } else {
        items.push(item)
      }
    }

    return { items, tpItems }
  }

  private async getTPCollectionItems(
    dbCollection: ThirdPartyCollectionAttributes,
    dbItems: ItemAttributes[]
  ): Promise<{ collection: CollectionAttributes; items: FullItem[] }> {
    const lastItemCuration = await ItemCuration.findLastCreatedByCollectionIdAndStatus(
      dbCollection.id,
      CurationStatus.APPROVED
    )
    const collection = lastItemCuration
      ? Bridge.mergeTPCollection(dbCollection, lastItemCuration)
      : dbCollection

    const items = await Bridge.consolidateTPItems(dbItems)
    return { collection, items }
  }

  private async getDCLCollectionItems(
    dbCollection: CollectionAttributes,
    dbItems: ItemAttributes[]
  ): Promise<{ collection: CollectionAttributes; items: FullItem[] }> {
    const {
      collection: remoteCollection,
      items: remoteItems,
    } = await collectionAPI.fetchCollectionWithItemsByContractAddress(
      dbCollection.contract_address!
    )
    const collection = remoteCollection
      ? Bridge.mergeCollection(dbCollection, remoteCollection)
      : dbCollection

    const items = await Bridge.consolidateItems(dbItems, remoteItems)

    return { collection, items }
  }

  private async getTPItem(
    dbItem: ThirdPartyItemAttributes
  ): Promise<{ item: FullItem; collection?: CollectionAttributes }> {
    let item: FullItem = Bridge.toFullItem(dbItem)
    let collection = await Collection.findOne(dbItem.collection_id)

    if (collection && isTPCollection(collection)) {
      const urn = buildTPItemURN(
        collection.third_party_id,
        collection.urn_suffix,
        dbItem.urn_suffix!
      )

      const lastItemCuration = await ItemCuration.findLastCreatedByCollectionIdAndStatus(
        collection.id,
        CurationStatus.APPROVED
      )
      collection = lastItemCuration
        ? Bridge.mergeTPCollection(collection, lastItemCuration)
        : collection

      const catalystItems = await peerAPI.fetchWearables([urn])
      if (catalystItems.length > 0) {
        item = Bridge.mergeTPItem(dbItem, catalystItems[0])
      }
    }

    return { item, collection }
  }

  private async getDCLItem(
    dbItem: ItemAttributes
  ): Promise<{ item: FullItem; collection?: CollectionAttributes }> {
    let item: FullItem = Bridge.toFullItem(dbItem)
    let collection: CollectionAttributes | undefined

    if (dbItem.collection_id && dbItem.blockchain_item_id) {
      const dbCollection = await Collection.findOne<CollectionAttributes>(
        dbItem.collection_id
      )

      if (!dbCollection) {
        throw new InconsistentItemError(
          dbItem.id,
          'Invalid item. Its collection seems to be missing'
        )
      }

      const {
        collection: remoteCollection,
        item: remoteItem,
      } = await collectionAPI.fetchCollectionWithItem(
        dbCollection.contract_address!,
        dbItem.blockchain_item_id
      )

      if (remoteCollection) {
        collection = Bridge.mergeCollection(dbCollection, remoteCollection)

        if (remoteItem) {
          const [catalystItem] = await peerAPI.fetchWearables([remoteItem.urn])
          item = Bridge.mergeItem(
            dbItem,
            remoteItem,
            remoteCollection,
            catalystItem
          )
        }
      }

      // Set the item's URN
      item.urn =
        item.urn ??
        getDecentralandItemURN(dbItem, dbCollection.contract_address!)
    }

    return { item, collection }
  }

  private checkItemIsMovedToAnotherCollection(
    itemToUpsert: FullItem,
    dbItem: ItemAttributes
  ): void {
    const areBothCollectionIdsDefined =
      itemToUpsert.collection_id && dbItem.collection_id

    const isItemCollectionBeingChanged =
      areBothCollectionIdsDefined &&
      itemToUpsert.collection_id !== dbItem.collection_id

    if (isItemCollectionBeingChanged) {
      throw new ItemCantBeMovedFromCollectionError(itemToUpsert.id)
    }
  }

  private async deleteDCLItem(dbItem: ItemAttributes): Promise<void> {
    if (dbItem.collection_id) {
      const dbCollection = await this.collectionService.getDBCollection(
        dbItem.collection_id
      )
      if (
        await this.collectionService.isPublished(dbCollection.contract_address!)
      ) {
        throw new DCLItemAlreadyPublishedError(
          dbItem.id,
          dbCollection.contract_address!,
          ItemAction.DELETE
        )
      }
      if (this.collectionService.isLockActive(dbCollection.lock)) {
        throw new CollectionForItemLockedError(dbItem.id, ItemAction.DELETE)
      }
    }
    await Item.delete({ id: dbItem.id })
  }

  private async deleteThirdPartyItem(dbItem: ItemAttributes): Promise<void> {
    if (!dbItem.collection_id) {
      throw new InconsistentItemError(
        dbItem.id,
        "The third party item isn't part of a collection"
      )
    }
    const dbCollection = await this.collectionService.getDBCollection(
      dbItem.collection_id
    )

    if (!isTPCollection(dbCollection)) {
      throw new InconsistentItemError(
        dbItem.id,
        "The third party item does't belong to a third party collection"
      )
    }

    if (this.collectionService.isLockActive(dbCollection.lock)) {
      throw new CollectionForItemLockedError(dbItem.id, ItemAction.DELETE)
    }

    if (await ItemCuration.existsByItemId(dbItem.id)) {
      const itemURN = buildTPItemURN(
        dbCollection.third_party_id,
        dbCollection.urn_suffix,
        dbItem.urn_suffix!
      )
      throw new ThirdPartyItemAlreadyPublishedError(
        dbItem.id,
        itemURN,
        ItemAction.DELETE
      )
    }

    await Item.delete({ id: dbItem.id })
  }

  private async upsertDCLItem(
    item: FullItem,
    dbItem: ItemAttributes | undefined,
    dbCollection: CollectionAttributes | undefined,
    eth_address: string
  ): Promise<FullItem> {
    const canUpsert = await new Ownable(Item).canUpsert(item.id, eth_address)
    if (!canUpsert) {
      throw new UnauthorizedToUpsertError(item.id, eth_address)
    }

    if (dbCollection) {
      const isCollectionOwnerDifferent =
        dbCollection.eth_address.toLowerCase() !== eth_address

      // Prohibits adding an item to a collection that is not owned by the user
      if (isCollectionOwnerDifferent) {
        throw new UnauthorizedToChangeToCollectionError(
          item.id,
          eth_address,
          item.collection_id!
        )
      }

      const isDbCollectionPublished =
        dbCollection &&
        (await this.collectionService.isPublished(
          dbCollection.contract_address!
        ))

      if (isDbCollectionPublished) {
        // Prohibits adding new items to a published collection
        if (!dbItem) {
          throw new DCLItemAlreadyPublishedError(
            item.id,
            dbCollection.contract_address!,
            ItemAction.INSERT
          )
        }

        // Prohibits removing an item from a published collection
        const isItemBeingRemovedFromCollection =
          !item.collection_id && dbItem.collection_id

        if (isItemBeingRemovedFromCollection) {
          throw new DCLItemAlreadyPublishedError(
            item.id,
            dbCollection.contract_address!,
            ItemAction.DELETE
          )
        }

        // Prohibits changing the rarity of a published item.
        const areBothRaritiesDefined = item.rarity && dbItem.rarity

        const isRarityBeingChanged =
          areBothRaritiesDefined && item.rarity !== dbItem.rarity

        if (isRarityBeingChanged) {
          throw new DCLItemAlreadyPublishedError(
            item.id,
            dbCollection.contract_address!,
            ItemAction.RARITY_UPDATE
          )
        }
      } else if (this.collectionService.isLockActive(dbCollection.lock)) {
        throw new CollectionForItemLockedError(item.id, ItemAction.UPSERT)
      }
    }

    const attributes = toDBItem({
      ...item,
      eth_address,
    })

    const upsertedItem: ItemAttributes = await new Item(attributes).upsert()
    return Bridge.toFullItem(upsertedItem, dbCollection)
  }

  /**
   * Updates or insert a third party item.
   * When doing an insert or an update, the following cases are considered:
   * 1) The item doesn't exist in the DB but the collection exists and it's a third party collection.
   * 2) The item exists in the DB and belongs to a third party collection.
   *  a) The item was a third party item but now it's moved out of the third party collection (by removing the collection id).
   *  b) The item was an item without collection and it's moved into a third party collection.
   *  c) The item's collection didn't change, but it's metadata or URN did.
   *
   * @param item - The item to be updated or inserted.
   * @param dbItem - The item in the DB to be updated or inserted.
   * @param dbCollection - If the dbItem has a collection, it's third party collection, if it doesn't the item's third party collection.
   * @param eth_address - The address of the user updating or inserting the collection.
   */
  private async upsertThirdPartyItem(
    item: FullItem,
    dbItem: ItemAttributes | undefined,
    dbCollection: CollectionAttributes,
    eth_address: string
  ): Promise<FullItem> {
    // Check if the collection being used in this update or insert process is accessible by the user
    if (dbCollection) {
      if (
        !(await thirdPartyAPI.isManager(
          dbCollection.third_party_id!,
          eth_address
        ))
      ) {
        throw new UnauthorizedToUpsertError(item.id, eth_address)
      }
    }

    // If there's an existing item already, we'll update it
    if (dbItem) {
      const isMovingItemOutOfACollection =
        dbItem.collection_id !== null && item.collection_id === null
      const isMovingItemIntoACollection =
        dbItem.collection_id === null && item.collection_id !== null

      if (!isMovingItemOutOfACollection && item.urn === null) {
        throw new InvalidItemURNError()
      }

      if (isMovingItemOutOfACollection) {
        // The item can't be moved if published
        if (await ItemCuration.existsByItemId(dbItem.id)) {
          const dbItemURN = buildTPItemURN(
            dbCollection!.third_party_id!,
            dbCollection!.urn_suffix!,
            dbItem.urn_suffix!
          )
          throw new ThirdPartyItemAlreadyPublishedError(
            dbItem.id,
            dbItemURN,
            ItemAction.UPSERT
          )
        }

        // nullify the item URN so we get a nulled urn_suffix when inserting it into the DB
        item.urn = null
      } else if (isMovingItemIntoACollection) {
        const decodedItemURN = decodeThirdPartyItemURN(item.urn!)

        // Can't add an item with a URN that already exists (If it was URN)
        if (await ItemCuration.existsByItemId(dbItem.id)) {
          const dbItemURN = buildTPItemURN(
            dbCollection!.third_party_id!,
            dbCollection!.urn_suffix!,
            decodedItemURN.item_urn_suffix
          )
          throw new ThirdPartyItemAlreadyPublishedError(
            dbItem.id,
            dbItemURN,
            ItemAction.UPSERT
          )
        }
      }
      // Collection doesn't change.
      else {
        const decodedURN = decodeThirdPartyItemURN(item.urn!)
        if (dbItem.urn_suffix !== decodedURN.item_urn_suffix) {
          // Check if the item is published before changing it
          if (await ItemCuration.existsByItemId(dbItem.id)) {
            const dbItemURN = buildTPItemURN(
              dbCollection.third_party_id!,
              dbCollection.urn_suffix!,
              dbItem.urn_suffix!
            )

            throw new ThirdPartyItemAlreadyPublishedError(
              dbItem.id,
              dbItemURN,
              ItemAction.UPSERT
            )
          }

          // Build the item's URN using the third party id and the urn suffix in the collection
          // to prevent URNs from being manipulated.
          const itemURN = buildTPItemURN(
            dbCollection.third_party_id!,
            dbCollection.urn_suffix!,
            decodedURN.item_urn_suffix
          )

          // Check if the new URN is not already in use
          const [wearable] = await peerAPI.fetchWearables([itemURN])
          if (wearable) {
            throw new ThirdPartyItemAlreadyPublishedError(
              item.id,
              item.urn!,
              ItemAction.UPSERT
            )
          }
        }
      }
    }
    // The item didn't exist and is being inserted into a third party collection.
    else {
      if (item.urn === null) {
        throw new InvalidItemURNError()
      }

      const decodedItemURN = decodeThirdPartyItemURN(item.urn!)
      const itemURN = buildTPItemURN(
        dbCollection.third_party_id!,
        dbCollection.urn_suffix!,
        decodedItemURN.item_urn_suffix
      )

      // Check if the chosen URN is already in use
      const [wearable] = await peerAPI.fetchWearables([itemURN])
      if (wearable) {
        throw new ThirdPartyItemAlreadyPublishedError(
          item.id,
          itemURN,
          ItemAction.UPSERT
        )
      }
    }

    const attributes = toDBItem({
      ...item,
      eth_address,
    })

    const upsertedItem: ItemAttributes = await new Item(attributes).upsert()
    return Bridge.toFullItem(upsertedItem, dbCollection)
  }
}
