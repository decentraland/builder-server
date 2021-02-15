import { CollectionAttributes, Collection } from '../../Collection'
import { ItemAttributes } from '../../Item'
import { ItemFragment, CollectionFragment } from './fragments'
import { collectionAPI } from './collection'

export class Bridge {
  static consolidateCollections(
    dbCollections: CollectionAttributes[],
    remoteCollections: CollectionFragment[]
  ) {
    const collections: CollectionAttributes[] = []

    for (const dbCollection of dbCollections) {
      const remoteCollection = remoteCollections.find(
        (remoteCollection) =>
          remoteCollection.id === dbCollection.contract_address
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

    // Get collections from DB
    const collectionIds = dbItems.reduce<string[]>((ids, dbItem) => {
      if (dbItem.collection_id) {
        ids.push(dbItem.collection_id)
      }
      return ids
    }, [])
    const dbResults = await Collection.findByIds(collectionIds)
    const dbCollections = this.indexById(dbResults)

    // Get remote collections
    const addresses = Object.values(dbCollections).map(
      (dbCollection) => dbCollection.contract_address
    )
    const remoteResults = await collectionAPI.fetchCollections(addresses)
    const remoteCollections = this.indexById(remoteResults)

    // Reduce it to a map for fast lookup

    for (const dbItem of dbItems) {
      let item = dbItem

      // Check if DB item has a collection
      if (dbItem.collection_id) {
        const dbCollection = dbCollections[dbItem.collection_id]
        if (dbCollection) {
          // Find remote item
          const remoteItem = dbItem.blockchain_item_id
            ? remoteItems.find(
                (remoteItem) =>
                  remoteItem.id ===
                  collectionAPI.buildItemId(
                    dbCollection.contract_address,
                    dbItem.blockchain_item_id!
                  )
              )
            : null

          // Find remote collection
          const remoteCollection =
            remoteCollections[dbCollection.contract_address]

          // Merge item from DB with remote data
          if (remoteItem && remoteCollection) {
            item = Bridge.mergeItem(dbItem, remoteItem, remoteCollection)
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
  ) {
    return {
      ...dbCollection,
      name: remoteCollection.name,
      eth_address: remoteCollection.creator,
      contract_address: remoteCollection.id,
      is_published: true,
      is_approved: remoteCollection.isApproved,
      minters: remoteCollection.minters,
      managers: remoteCollection.managers,
    }
  }

  static mergeItem(
    dbItem: ItemAttributes,
    remoteItem: ItemFragment,
    remoteCollection: CollectionFragment
  ) {
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
}
