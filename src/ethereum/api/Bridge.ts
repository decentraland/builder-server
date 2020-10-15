import { CollectionAttributes, CollectionWithItems } from '../../Collection'
import { ItemAttributes, CollectionItem } from '../../Item'
import { CollectionFields, CollectionFragment, ItemFragment } from './fragments'

export class Bridge {
  consolidateCollections(
    dbCollections: CollectionWithItems[],
    remoteCollections: Partial<CollectionAttributes>[],
    remoteItems: Partial<CollectionItem>[] = []
  ) {
    const collections: CollectionWithItems[] = []
    const remoteAddresses = remoteCollections.map(
      collection => collection.contract_address
    )

    for (const dbCollection of dbCollections) {
      const index = remoteAddresses.indexOf(dbCollection.contract_address)
      const remoteCollection = remoteCollections[index]
      const collection =
        index === -1 ? dbCollection : { ...dbCollection, ...remoteCollection }

      const remoteCollectionItems = remoteItems.filter(
        item => item.collection_id === collection.id
      )
      collection.items = this.consolidateItems(
        dbCollection.items,
        remoteCollectionItems
      )

      collections.push(collection)
    }

    return collections
  }

  consolidateItems(
    dbItems: CollectionItem[],
    remoteItems: Partial<CollectionItem>[]
  ) {
    const items: ItemAttributes[] = []

    for (const dbItem of dbItems) {
      let item = dbItem

      if (dbItem.collection) {
        const index = remoteItems.findIndex(
          item =>
            item.blockchain_item_id === dbItem.blockchain_item_id &&
            item.collection!.contract_address ===
              dbItem.collection!.contract_address
        )

        if (index !== -1) {
          const remoteItem = remoteItems[index]

          item = {
            ...dbItem,
            ...remoteItem,
            collection: {
              ...dbItem.collection,
              ...remoteItem.collection
            }
          }
        }
      }

      items.push(item)
    }

    return items
  }

  fromRemoteCollection(
    collection: CollectionFragment | CollectionFields
  ): Partial<CollectionAttributes> {
    return {
      name: collection.name,
      eth_address: collection.creator,
      contract_address: collection.id,
      is_published: true,
      is_approved: collection.isApproved,
      minters: collection.minters,
      managers: collection.managers
    }
  }

  fromRemoteItem(item: ItemFragment): Partial<ItemAttributes> {
    return {
      price: item.price,
      beneficiary: item.beneficiary,
      blockchain_item_id: item.blockchainId,
      is_published: true,
      is_approved: item.collection.isApproved,
      total_supply: Number(item.totalSupply)
    }
  }
}
