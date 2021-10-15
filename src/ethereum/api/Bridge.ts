import { utils } from 'decentraland-commons'
import { CollectionAttributes, Collection } from '../../Collection'
import { ItemAttributes, Item, FullItem } from '../../Item'
import { ItemFragment, CollectionFragment } from './fragments'
import { collectionAPI } from './collection'
import { Wearable } from './peer'
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
          dbCollection.contract_address!.toLowerCase()
      )
      const collection = remoteCollection
        ? Bridge.mergeCollection(dbCollection, remoteCollection)
        : dbCollection

      collections.push(collection)
    }

    return collections
  }

  static toFullItem(dbItem: ItemAttributes): FullItem {
    return utils.omit(
      {
        ...dbItem,
        urn: null,
        in_catalyst: false,
        is_approved: false,
        is_published: false,
        total_supply: 0,
        content_hash: null,
      },
      ['urn_suffix']
    )
  }

  static async consolidateItems(
    dbItems: ItemAttributes[],
    remoteItems: ItemFragment[],
    catalystItems: Wearable[]
  ) {
    const items: FullItem[] = []

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

    // Reduce it to a map for fast lookup
    const dbCollectionsIndex = this.indexById(dbResults)
    const catalystItemsIndex = this.indexById(catalystItems)

    for (let dbItem of allDbItems) {
      let itemToAdd = Bridge.toFullItem(dbItem)
      const dbCollection = dbItem.collection_id
        ? dbCollectionsIndex[dbItem.collection_id]
        : null
      if (dbCollection) {
        // Find remote item
        const remoteItemId = collectionAPI.buildItemId(
          dbCollection.contract_address!,
          dbItem.blockchain_item_id!
        )
        const remoteItem = dbItem.blockchain_item_id
          ? remoteItems.find((remoteItem) => remoteItem.id === remoteItemId)
          : null

        // Merge item from DB with remote data
        if (remoteItem && remoteItem.collection) {
          const urn = remoteItem.urn.toLowerCase()
          const catalystItem = catalystItemsIndex[urn]
          itemToAdd = Bridge.mergeItem(
            dbItem,
            remoteItem,
            remoteItem.collection,
            catalystItem
          )
        }
      }
      items.push(itemToAdd)
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
    remoteCollection: CollectionFragment,
    catalystItem?: Wearable
  ): FullItem {
    const { wearable } = remoteItem.metadata

    const name = dbItem.name
    const description = dbItem.description
    const data = dbItem.data
    const category = data.category
    const rarity = wearable?.rarity || dbItem.rarity
    const contents = dbItem.contents
    const metrics = dbItem.metrics
    const in_catalyst = !!catalystItem

    let urn: string | null = null

    if (catalystItem) {
      urn = catalystItem.id
    } else if (remoteItem && remoteItem.urn) {
      urn = remoteItem.urn
    }

    // Caveat!: we're not considering Fragment bodyshapes here, because it's an edge case and it's really hard to consolidate,
    // which means that if the user sends a transaction changing those values, it won't be reflected in the builder
    return {
      ...Bridge.toFullItem(dbItem),
      name,
      urn,
      description,
      rarity,
      price: remoteItem.price,
      beneficiary: remoteItem.beneficiary,
      blockchain_item_id: remoteItem.blockchainId,
      is_published: true,
      is_approved: remoteCollection.isApproved,
      total_supply: Number(remoteItem.totalSupply),
      in_catalyst,
      metrics,
      contents,
      content_hash: remoteItem.contentHash || null,
      data: {
        ...data,
        category,
      },
    }
  }

  static indexById<T extends { id: string }>(list: (T | undefined)[]) {
    return list.reduce((obj, result) => {
      if (result) {
        obj[result.id.toLowerCase()] = result
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
