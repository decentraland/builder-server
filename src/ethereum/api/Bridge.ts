import { CollectionAttributes, Collection } from '../../Collection'
import { ItemAttributes, Item } from '../../Item'
import { ItemFragment, CollectionFragment } from './fragments'
import { collectionAPI } from './collection'
import { fromUnixTimestamp } from '../../utils/parse'

export class Bridge {
  static async consolidateCollections(
    dbCollections: CollectionAttributes[],
    remoteCollections: CollectionFragment[]
  ) {
    const collections: CollectionAttributes[] = []

    const dbCollectionsByRemotes = await Collection.findByContractAddresses(
      remoteCollections.map((collection) => collection.id)
    )

    // Filter collections already found on the database to avoid duplicates
    const allDbCollections = this.distinctById<CollectionAttributes>([
      ...dbCollections,
      ...dbCollectionsByRemotes,
    ])

    for (const dbCollection of allDbCollections) {
      const remoteCollection = remoteCollections.find(
        (remoteCollection) =>
          remoteCollection.id.toLowerCase() ===
          dbCollection.contract_address.toLowerCase()
      )
      const collection = remoteCollection
        ? Bridge.mergeCollection(dbCollection, remoteCollection)
        : dbCollection

      collections.push(collection)
    }

    return collections
  }

  static async consolidateItems(
    dbItems: ItemAttributes[],
    remoteItems: ItemFragment[]
  ) {
    const items: ItemAttributes[] = []

    // To avoid multiple queries to the db, we will fetch all the items that match the blockchain_id and their collections
    // to filter them later
    const remoteDBItems = await Item.findByBlockchainIdsAndContractAddresses(
      remoteItems.map((remoteItem) => ({
        blockchainId: remoteItem.blockchainId,
        collectionAddress: remoteItem.collection.id,
      }))
    )

    // Filter items to avoid duplicates
    const allDbItems = this.distinctById<ItemAttributes>([
      ...dbItems,
      ...remoteDBItems,
    ])

    // Get db collections from DB items
    const collectionIds = []
    for (const item of allDbItems) {
      if (item.collection_id) {
        collectionIds.push(item.collection_id)
      }
    }

    const dbResults = await Collection.findByIds(collectionIds)
    const dbCollections = this.indexById(dbResults)

    // Reduce it to a map for fast lookup
    for (let dbItem of [...dbItems, ...remoteDBItems]) {
      let item = dbItem

      // Check if DB item has a collection
      if (dbItem.collection_id) {
        const dbCollection = dbCollections[dbItem.collection_id]
        if (dbCollection) {
          // Find remote item
          const remoteItemId = collectionAPI.buildItemId(
            dbCollection.contract_address,
            dbItem.blockchain_item_id!
          )
          const remoteItem = dbItem.blockchain_item_id
            ? remoteItems.find((remoteItem) => remoteItem.id === remoteItemId)
            : null

          // Merge item from DB with remote data
          if (remoteItem && remoteItem.collection) {
            item = Bridge.mergeItem(dbItem, remoteItem, remoteItem.collection)
          }
        }
      }

      items.push(item)
    }

    return items
  }

  static mergeCollection(
    dbCollection: CollectionAttributes,
    remoteCollection: CollectionFragment
  ): CollectionAttributes {
    return {
      ...dbCollection,
      name: remoteCollection.name,
      eth_address: remoteCollection.creator,
      contract_address: remoteCollection.id,
      is_published: true,
      is_approved: remoteCollection.isApproved,
      minters: remoteCollection.minters,
      managers: remoteCollection.managers,
      reviewed_at: fromUnixTimestamp(remoteCollection.reviewedAt),
      updated_at: fromUnixTimestamp(remoteCollection.updatedAt),
      created_at: fromUnixTimestamp(remoteCollection.createdAt),
    }
  }

  static mergeItem(
    dbItem: ItemAttributes,
    remoteItem: ItemFragment,
    remoteCollection: CollectionFragment
  ): ItemAttributes {
    return {
      ...dbItem,
      price: remoteItem.price,
      beneficiary: remoteItem.beneficiary,
      blockchain_item_id: remoteItem.blockchainId,
      is_published: true,
      is_approved: remoteCollection.isApproved,
      total_supply: Number(remoteItem.totalSupply),
    }
  }

  static indexById<T extends { id: string }>(list: (T | undefined)[]) {
    return list.reduce((obj, result) => {
      if (result) {
        obj[result.id] = result
      }
      return obj
    }, {} as Record<string, T>)
  }

  static distinctById<T extends { id: string }>(list: T[]): T[] {
    return list.filter(
      (obj, index, self) =>
        self.findIndex((innerObj) => innerObj.id === obj.id) === index
    )
  }
}
