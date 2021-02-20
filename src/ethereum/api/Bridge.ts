import { getAddress } from '@ethersproject/address'

import { CollectionAttributes, Collection } from '../../Collection'
import { ItemAttributes, Item } from '../../Item'
import { ItemFragment, CollectionFragment } from './fragments'
import { collectionAPI } from './collection'

export class Bridge {
  static async consolidateCollections(
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

    const remoteCollectionCreators = remoteCollections.map((collection) =>
      getAddress(collection.creator)
    )
    const dbCollectionsByRemotes = await Collection.findByEthAddresses(
      remoteCollectionCreators
    )
    for (const remoteCollection of remoteCollections) {
      // Get only db collections that has not been added in the collection array
      const dbCollection = dbCollectionsByRemotes.find(
        (collection) =>
          collection.contract_address === remoteCollection.id &&
          !collections.some(
            (collection) => collection.contract_address === remoteCollection.id
          )
      )

      // Do not display collections that was not created outside the server
      if (dbCollection) {
        collections.push(Bridge.mergeCollection(dbCollection, remoteCollection))
      }
    }

    return collections
  }

  static async consolidateItems(
    dbItems: ItemAttributes[],
    remoteItems: ItemFragment[]
  ) {
    const items: ItemAttributes[] = []

    // Get db collections from DB items
    const collectionIds = dbItems.reduce<string[]>((ids, dbItem) => {
      if (dbItem.collection_id) {
        ids.push(dbItem.collection_id)
      }
      return ids
    }, [])
    const dbResults = await Collection.findByIds(collectionIds)
    let dbCollections = this.indexById(dbResults)

    // Get db collections from remote items
    const addresses = remoteItems
      .filter(
        (remoteItem) =>
          !dbResults.some(
            (collection) =>
              collection.contract_address === remoteItem.collection.id
          )
      )
      .map((item) => item.collection.id)
    const collectionsDBFromremoteResults = await Collection.findByAddresses(
      addresses
    )
    dbCollections = {
      ...dbCollections,
      ...this.indexById(collectionsDBFromremoteResults),
    }
    const remoteDbItems = await Item.findByBlockchainItemIds(
      remoteItems.map((remoteItem) => remoteItem.blockchainId)
    )

    // Reduce it to a map for fast lookup
    for (const dbItem of [...dbItems, ...remoteDbItems]) {
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
          const remoteCollection = remoteItems.find(
            (remoteItem) =>
              remoteItem.collection.id === dbCollection.contract_address
          )?.collection

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
