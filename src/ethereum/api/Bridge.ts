import { CollectionAttributes } from '../../Collection'
import { ItemAttributes, CollectionItem } from '../../Item'
import { CollectionFields, CollectionFragment, ItemFragment } from './fragments'

export class Bridge {
  consolidateCollections(
    dbCollections: CollectionAttributes[],
    remoteCollections: Partial<CollectionAttributes>[]
  ) {
    const collections: CollectionAttributes[] = []
    const remoteAddresses = remoteCollections.map(
      collection => collection.contract_address
    )

    for (const dbCollection of dbCollections) {
      const index = remoteAddresses.indexOf(dbCollection.contract_address)
      const collection =
        index === -1
          ? dbCollection
          : { ...dbCollection, ...remoteCollections[index] }
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
      const index = remoteItems.findIndex(
        item =>
          item.blockchain_item_id === dbItem.blockchain_item_id &&
          item.collection!.contract_address ===
            dbItem.collection.contract_address
      )

      const item = index === -1 ? dbItem : { ...dbItem, ...remoteItems[index] }
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
