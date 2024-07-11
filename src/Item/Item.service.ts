import { Wearable } from '@dcl/schemas'
import { omit } from 'decentraland-commons/dist/utils'
import {
  Collection,
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
} from '../Collection'
import { CollectionService } from '../Collection/Collection.service'
import { CurationStatus } from '../Curation'
import { ItemCuration } from '../Curation/ItemCuration'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { peerAPI } from '../ethereum/api/peer'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { isStandardItemPublished } from '../ItemAndCollection/utils'
import { Ownable } from '../Ownable'
import { buildModelDates } from '../utils/dates'
import {
  decodeThirdPartyItemURN,
  getDecentralandItemURN,
  isTPCollection,
} from '../utils/urn'
import { calculateItemContentHash } from './hashes'
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
  URNAlreadyInUseError,
  ThirdPartyItemInsertByURNError,
  MaximunAmountOfTagsReachedError,
} from './Item.errors'
import { Item, MAX_TAGS_LENGTH } from './Item.model'
import {
  FullItem,
  ItemAttributes,
  ThirdPartyItemAttributes,
} from './Item.types'
import {
  VIDEO_PATH,
  buildTPItemURN,
  isSmartWearable,
  isTPItem,
  toDBItem,
} from './utils'

export class ItemService {
  private collectionService = new CollectionService()

  /**
   * Updates or insert an item, either a third party item or a standard item.
   *
   * @param item - The item to be updated or inserted.
   * @param eth_address - The address that is trying to upsert the item.
   */
  public async upsertItem(
    item: FullItem,
    eth_address: string
  ): Promise<FullItem> {
    const decodedItemURN =
      !item.id && item.urn ? decodeThirdPartyItemURN(item.urn) : null

    // Finds the item to be updated by URN if it's a third party item or by ID if it's not
    const dbItem = decodedItemURN
      ? await Item.findByURNSuffix(
          decodedItemURN.third_party_id,
          decodedItemURN.item_urn_suffix
        )
      : await Item.findOne<ItemAttributes>(item.id)

    if (item.data.tags.length > MAX_TAGS_LENGTH) {
      const isAlreadyExceeded =
        !!dbItem && dbItem.data.tags.length > MAX_TAGS_LENGTH
      const isAddingMoreTags =
        !!dbItem && item.data.tags.length > dbItem.data.tags.length
      if (!dbItem || (isAlreadyExceeded && isAddingMoreTags)) {
        throw new MaximunAmountOfTagsReachedError(item.id)
      }
    }

    // Inserting by URN is not allowed
    if (!item.id && item.urn && !dbItem) {
      throw new ThirdPartyItemInsertByURNError(item.urn)
    }

    const isMovingItemFromACollectionToAnother =
      dbItem && this.isMovingItemFromACollectionToAnother(item, dbItem)
    const isMovingOrphanItemIntoACollection =
      dbItem && dbItem.collection_id === null && item.collection_id !== null

    const collectionId = dbItem?.collection_id ?? item.collection_id

    const [dbItemCollection, itemCollection] = await Promise.all([
      collectionId
        ? this.collectionService.getDBCollection(collectionId)
        : undefined,
      isMovingItemFromACollectionToAnother || isMovingOrphanItemIntoACollection
        ? this.collectionService.getDBCollection(item.collection_id!)
        : undefined,
    ])

    // Moving items between TP collections is forbidden
    const isMovingFromDCLCollectionToTPCollectionOrViceVersa =
      isMovingItemFromACollectionToAnother &&
      itemCollection &&
      dbItemCollection &&
      (isTPCollection(itemCollection) || isTPCollection(dbItemCollection))
    const isMovingOrphanItemIntoATPCollection =
      isMovingOrphanItemIntoACollection &&
      itemCollection &&
      isTPCollection(itemCollection)

    if (
      isMovingFromDCLCollectionToTPCollectionOrViceVersa ||
      isMovingOrphanItemIntoATPCollection
    ) {
      throw new ItemCantBeMovedFromCollectionError(item.id)
    }

    // Set the item dates
    item = { ...item, ...buildModelDates(dbItem?.created_at) }

    // An item is a third party item if it's current collection or the collection
    // that is going to be inserted into is a third party collection.
    if (dbItemCollection && isTPCollection(dbItemCollection)) {
      return this.upsertThirdPartyItem(
        item,
        dbItem,
        dbItemCollection,
        eth_address
      )
    } else {
      return this.upsertDCLItem(
        item,
        dbItem,
        dbItemCollection,
        itemCollection,
        eth_address
      )
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
    } else if (dbItem.collection_id) {
      return this.collectionService.isOwnedOrManagedBy(
        dbItem.collection_id,
        ethAddress
      )
    } else {
      return ethAddress === dbItem.eth_address
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
    collectionId: string,
    filters: {
      status?: CurationStatus
      synced?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<{
    collection: CollectionAttributes
    items: FullItem[]
    totalItems: number
  }> {
    const { synced, status, limit, offset } = filters
    const dbCollection = await this.collectionService.getDBCollection(
      collectionId
    )
    const isTP = isTPCollection(dbCollection)
    const dbItemsWithCount =
      status && isTP
        ? await Item.findByCollectionIdAndStatus(
            collectionId,
            {
              synced,
              status: CurationStatus.PENDING,
            },
            limit,
            offset
          )
        : await Item.findByCollectionIds([collectionId], synced, limit, offset)

    const totalItems = Number(dbItemsWithCount[0]?.total_count ?? 0)
    const dbItems = dbItemsWithCount.map((dbItemWithCount) =>
      omit<ItemAttributes>(dbItemWithCount, ['total_count'])
    )

    const { collection, items } = isTPCollection(dbCollection)
      ? await this.getTPCollectionItems(dbCollection, dbItems)
      : await this.getDCLCollectionItems(dbCollection, dbItems)

    return {
      collection,
      items,
      totalItems,
    }
  }

  public async findItemsForAddress(
    address: string,
    params: {
      collectionId?: string
      limit?: number
      offset?: number
    }
  ): Promise<(ItemAttributes & { total_count: number })[]> {
    const thirdParties = await thirdPartyAPI.fetchThirdPartiesByManager(address)
    const thirdPartyIds = thirdParties.map((thirdParty) => thirdParty.id)

    return Item.findItemsByAddress(address, thirdPartyIds, params)
  }

  /**
   * Gets the item utility of a published collection's item.
   *
   * @param collectionAddress - The collection address in the blockchain.
   * @param blockchainId - The blockchain id.
   */
  public async getItemUtilityByContractAddressAndTokenId(
    collectionAddress: string,
    blockchainId: string
  ): Promise<string | null> {
    const dbItem = await Item.findByBlockchainIdsAndContractAddresses([
      {
        blockchainId,
        collectionAddress,
      },
    ])

    if (dbItem.length === 0) {
      throw new NonExistentItemError(`${collectionAddress}-${blockchainId}`)
    }

    return dbItem[0].utility
  }

  public async getItemByContractAddressAndTokenId(
    collectionAddress: string,
    blockchainId: string
  ): Promise<{ item: FullItem; collection?: CollectionAttributes }> {
    const dbItem = await Item.findByBlockchainIdsAndContractAddresses([
      {
        blockchainId,
        collectionAddress,
      },
    ])

    if (dbItem.length === 0) {
      throw new NonExistentItemError(`${collectionAddress}-${blockchainId}`)
    }

    return isTPItem(dbItem[0])
      ? this.getTPItem(dbItem[0])
      : this.getDCLItem(dbItem[0])
  }

  /**
   * Takes a list of items and returns an object containing two sets, one of standard items and the other of TP items
   * @param allItems - Items to split, can be any combination of item types
   */
  public splitItems<T extends ItemAttributes[]>(
    allItems: T
  ): { items: ItemAttributes[]; tpItems: ThirdPartyItemAttributes[] } {
    const items: ItemAttributes[] = []
    const tpItems: ThirdPartyItemAttributes[] = []

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
    const collectionItemCurations = await ItemCuration.findByCollectionId(
      dbCollection.id
    )
    const collection =
      collectionItemCurations.length > 0
        ? Bridge.mergeTPCollection(dbCollection, collectionItemCurations[0])
        : dbCollection

    const items = await Bridge.consolidateTPItems(
      dbItems,
      collectionItemCurations,
      [dbCollection]
    )
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

    const items = await Bridge.consolidateItems(dbItems, remoteItems, [
      dbCollection,
    ])

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

      const lastItemCuration = await ItemCuration.findLastByCollectionId(
        collection.id
      )
      collection = lastItemCuration
        ? Bridge.mergeTPCollection(collection, lastItemCuration)
        : collection

      const catalystItems = await peerAPI.fetchWearables<Wearable>([urn])
      if (catalystItems.length > 0) {
        item = Bridge.mergeTPItem(dbItem, collection, catalystItems[0])
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
        `${dbCollection.contract_address}-${dbItem.blockchain_item_id}`
      )

      if (remoteCollection) {
        collection = Bridge.mergeCollection(dbCollection, remoteCollection)

        if (remoteItem) {
          const [catalystItem] = await peerAPI.fetchItems<Wearable>(
            [dbItem],
            [remoteItem],
            [dbCollection]
          )
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

  private isMovingItemFromACollectionToAnother(
    itemToUpsert: FullItem,
    dbItem: ItemAttributes
  ): boolean {
    const areBothCollectionIdsDefined =
      !!itemToUpsert.collection_id && !!dbItem.collection_id

    return (
      areBothCollectionIdsDefined &&
      itemToUpsert.collection_id !== dbItem.collection_id
    )
  }

  private async deleteDCLItem(dbItem: ItemAttributes): Promise<void> {
    if (dbItem.collection_id) {
      const dbCollection = await this.collectionService.getDBCollection(
        dbItem.collection_id
      )
      if (
        await this.collectionService.isDCLPublished(
          dbCollection.contract_address!
        )
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

  private isCollectionOwner(
    address: string,
    collection: CollectionAttributes
  ): boolean {
    return collection.eth_address.toLowerCase() === address.toLowerCase()
  }

  private async upsertDCLItem(
    item: FullItem,
    dbItem: ItemAttributes | undefined,
    // the collection of the item to be inserted into
    dbCollection: CollectionAttributes | undefined,
    // the target collection fo the item
    itemCollection: CollectionAttributes | undefined,
    eth_address: string
  ): Promise<FullItem> {
    const isMovingItemBetweenCollections =
      dbItem && this.isMovingItemFromACollectionToAnother(item, dbItem)

    const [
      isDbItemCollectionPublished,
      isItemCollectionPublished,
    ] = await Promise.all([
      dbCollection &&
        dbCollection.contract_address &&
        this.collectionService.isDCLPublished(dbCollection.contract_address),
      isMovingItemBetweenCollections &&
        itemCollection &&
        itemCollection.contract_address &&
        this.collectionService.isDCLPublished(itemCollection.contract_address),
    ])

    const isDbItemCollectionOwner =
      dbCollection && this.isCollectionOwner(eth_address, dbCollection)
    const isItemCollectionOwner =
      itemCollection && this.isCollectionOwner(eth_address, itemCollection)

    // Check if we have permissions to move or edit an orphaned item
    if (!dbItem?.collection_id) {
      const canUpsert = await new Ownable(Item).canUpsert(item.id, eth_address)
      if (!canUpsert) {
        throw new UnauthorizedToUpsertError(item.id, eth_address)
      }
    }

    const isManagerOfDbItemCollection =
      isDbItemCollectionPublished &&
      dbCollection &&
      this.collectionService.isDCLManagerOfCollection(dbCollection, eth_address)

    const isManagerOfItemCollection =
      isItemCollectionPublished &&
      itemCollection &&
      this.collectionService.isDCLManagerOfCollection(
        itemCollection,
        eth_address
      )

    // Performs checks to the collection the item is being inserted or moved out of
    if (dbCollection) {
      // Prohibits adding an item to a collection that is not owned by the user
      if (!isDbItemCollectionOwner && !isManagerOfDbItemCollection) {
        throw new UnauthorizedToChangeToCollectionError(
          item.id,
          eth_address,
          item.collection_id!
        )
      }

      if (isDbItemCollectionPublished) {
        // Prohibits adding new items or moving orphan ones to a published collection
        if (
          isMovingItemBetweenCollections ||
          !dbItem ||
          !dbItem.collection_id
        ) {
          throw new DCLItemAlreadyPublishedError(
            item.id,
            dbCollection.contract_address!,
            ItemAction.UPSERT
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

        /* If the collection is published, doesn't update the smart wearable video field.
         * This field will be updated when the curation is approved.
         */
        if (isSmartWearable(dbItem)) {
          item.video = dbItem.video
        }
      } else if (this.collectionService.isLockActive(dbCollection.lock)) {
        throw new CollectionForItemLockedError(item.id, ItemAction.UPSERT)
      }
    }

    // Performs checks to the collection the item is being moved into
    if (itemCollection) {
      // Prohibits moving an item to a collection that is not owned by the user
      if (!isItemCollectionOwner && !isManagerOfItemCollection) {
        throw new UnauthorizedToChangeToCollectionError(
          item.id,
          eth_address,
          item.collection_id!
        )
      }

      if (isItemCollectionPublished) {
        // Prohibits moving an existing item to a published collection
        if (isMovingItemBetweenCollections) {
          throw new DCLItemAlreadyPublishedError(
            item.id,
            itemCollection.contract_address ?? 'Unknown contract address',
            ItemAction.INSERT
          )
        }
      } else if (this.collectionService.isLockActive(itemCollection.lock)) {
        throw new CollectionForItemLockedError(item.id, ItemAction.UPSERT)
      }
    }

    const attributes = toDBItem({
      ...item,
      eth_address: dbItem?.eth_address ?? eth_address,
    })

    attributes.blockchain_item_id = dbItem ? dbItem.blockchain_item_id : null

    // Compute the content hash of the item to later store it in the DB
    attributes.local_content_hash =
      dbCollection && isStandardItemPublished(attributes, dbCollection)
        ? await calculateItemContentHash(attributes, dbCollection)
        : null

    const upsertedItem: ItemAttributes = await Item.upsert(attributes)
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
    const isMovingItemIntoAnotherCollection =
      dbItem &&
      dbItem.collection_id !== null &&
      item.collection_id !== null &&
      dbItem.collection_id !== item.collection_id
    const isMovingItemOutOfACollection =
      dbItem && dbItem.collection_id !== null && item.collection_id === null
    const isMovingItemIntoACollection =
      dbItem && dbItem.collection_id === null && item.collection_id !== null

    if (
      isMovingItemIntoAnotherCollection ||
      isMovingItemOutOfACollection ||
      isMovingItemIntoACollection
    ) {
      throw new ItemCantBeMovedFromCollectionError(item.id)
    }

    if (item.urn === null) {
      throw new InvalidItemURNError()
    }

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
    const decodedURN = decodeThirdPartyItemURN(item.urn)

    // If there's an existing item already, we'll update it
    if (dbItem) {
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
        // If the item is being upserted by id, check if the URN is not already in use
        if (item.id) {
          await this.checkIfThirdPartyItemURNExists(item.id, itemURN)
        }
      }
    }

    // The item didn't exist and is being inserted into a third party collection.
    else {
      const itemURN = buildTPItemURN(
        dbCollection.third_party_id!,
        dbCollection.urn_suffix!,
        decodedURN.item_urn_suffix
      )

      // If the item is being inserted, check if the URN is not already in use
      await this.checkIfThirdPartyItemURNExists(
        item.id,
        itemURN,
        ItemAction.INSERT
      )
    }

    const attributes = toDBItem({
      ...item,
      eth_address,
      ...(dbItem ? { id: dbItem.id } : {}), // if it is not receiving the id in the body but the item exists
    })

    attributes.local_content_hash = !isMovingItemOutOfACollection
      ? await calculateItemContentHash(attributes, dbCollection)
      : null

    const upsertedItem: ItemAttributes = await Item.upsert({
      ...attributes,
      ...(attributes.mappings
        ? // Stringify the JSON mappings to store it in the DB
          ({ mappings: JSON.stringify(attributes.mappings) } as any)
        : {}),
    })
    if (dbItem && attributes.local_content_hash) {
      // Update the Item Curation content_hash
      await ItemCuration.update(
        { content_hash: attributes.local_content_hash },
        { item_id: attributes.id, status: CurationStatus.PENDING }
      )
    }

    // When inserting the array as string, the client returns a string, so we need to parse it back to an array
    if (upsertedItem.mappings) {
      upsertedItem.mappings = JSON.parse(
        (upsertedItem.mappings as unknown) as string
      )
    }

    return Bridge.toFullItem(upsertedItem, dbCollection)
  }

  private async checkIfThirdPartyItemURNExists(
    id: string,
    urn: string,
    action = ItemAction.UPSERT
  ): Promise<void> {
    const decodedItemURN = decodeThirdPartyItemURN(urn)
    if (
      await Item.isURNRepeated(
        id,
        decodedItemURN.third_party_id,
        decodedItemURN.item_urn_suffix
      )
    ) {
      throw new URNAlreadyInUseError(id, urn, action)
    }
    const [wearable] = await peerAPI.fetchWearables<Wearable>([urn])
    if (wearable) {
      throw new URNAlreadyInUseError(id, urn, action)
    }
  }

  /* This method updates the video field for smart wearables
   * that has an updated video content
   */
  public async updateDCLItemsContent(collectionId: string) {
    const dbItemsWithCount = await Item.findByCollectionIds([collectionId])
    const dbItems = dbItemsWithCount.map((dbItemWithCount) =>
      omit<ItemAttributes>(dbItemWithCount, ['total_count'])
    )

    dbItems.forEach(async (dbItem) => {
      if (isSmartWearable(dbItem)) {
        if (dbItem.video !== dbItem.contents[VIDEO_PATH]) {
          dbItem.video = dbItem.contents[VIDEO_PATH]
          await Item.upsert(dbItem)
        }
      }
    })
  }
}
