import { utils } from 'decentraland-commons'
import { CollectionAttributes, Collection } from '../../Collection'
import { ItemAttributes, Item, FullItem } from '../../Item'
import { fromUnixTimestamp } from '../../utils/parse'
import { buildTPItemURN } from '../../Item/utils'
import {
  ItemFragment,
  CollectionFragment,
  ThirdPartyItemFragment,
} from './fragments'
import { collectionAPI } from './collection'
import { peerAPI, Wearable } from './peer'
import { thirdPartyAPI } from './thirdParty'
import { isTPCollection } from '../../Collection/utils'

export class Bridge {
  static async consolidateTPCollections(
    dbCollections: CollectionAttributes[]
  ): Promise<CollectionAttributes[]> {
    const collections: CollectionAttributes[] = []

    for (const dbCollection of dbCollections) {
      let fullCollection: CollectionAttributes = { ...dbCollection }

      if (isTPCollection(dbCollection)) {
        const lastItem = await thirdPartyAPI.fetchLastItem(
          dbCollection.third_party_id,
          dbCollection.urn_suffix
        )
        if (lastItem) {
          fullCollection = Bridge.mergeTPCollection(dbCollection, lastItem)
        }
      }

      collections.push(fullCollection)
    }
    return collections
  }

  static async consolidateTPItems(
    dbItems: ItemAttributes[],
    remoteItems: ThirdPartyItemFragment[]
  ): Promise<FullItem[]> {
    const dbTPItemIds = dbItems.map((item) => item.collection_id!)
    const dbTPCollections = await Collection.findByIds(dbTPItemIds)

    const itemsByURN: Record<
      string,
      { item: ItemAttributes; remoteItem?: ThirdPartyItemFragment }
    > = {}

    const tpItemURNs = dbItems.map((item) => {
      const collection = dbTPCollections.find(
        (collection) => collection.id === item.collection_id
      )

      if (!collection || !isTPCollection(collection)) {
        throw new Error(`Could not find a valid collection for item ${item.id}`)
      }

      const urn = buildTPItemURN(
        collection.third_party_id,
        collection.urn_suffix,
        item.urn_suffix!
      )

      const remoteItem = remoteItems.find(
        (remoteItem) => remoteItem.urn === urn
      )

      itemsByURN[urn] = { item, remoteItem }

      return urn
    })

    const tpCatalystItems = await peerAPI.fetchWearables(tpItemURNs)
    const fullItems: FullItem[] = []

    for (const urn in itemsByURN) {
      const { item, remoteItem } = itemsByURN[urn]
      let fullItem: FullItem

      if (remoteItem) {
        const catalystItem = tpCatalystItems.find(
          (catalystItem) => catalystItem.id === urn
        )

        fullItem = Bridge.mergeTPItem(item, remoteItem, catalystItem)
      } else {
        fullItem = Bridge.toFullItem(item)
      }

      fullItems.push(fullItem)
    }

    return fullItems
  }

  static mergeTPItem(
    dbItem: ItemAttributes,
    remoteItem: ThirdPartyItemFragment,
    catalystItem?: Wearable
  ): FullItem {
    const data = dbItem.data
    const category = data.category
    const in_catalyst = !!catalystItem

    let urn: string | null = null

    if (catalystItem) {
      urn = catalystItem.id
    } else if (remoteItem && remoteItem.urn) {
      urn = remoteItem.urn
    }

    return {
      ...Bridge.toFullItem(dbItem),
      urn,
      in_catalyst,
      is_published: true,
      total_supply: 0, // TODO: ??
      is_approved: remoteItem.isApproved,
      // price: remoteItem.price,
      // beneficiary: remoteItem.beneficiary, // TODO: ??
      blockchain_item_id: remoteItem.blockchainItemId,
      content_hash: remoteItem.contentHash || null,
      data: {
        ...data,
        category,
      },
    }
  }

  static async consolidateCollections(
    dbCollections: CollectionAttributes[],
    remoteCollections: CollectionFragment[]
  ): Promise<CollectionAttributes[]> {
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
      let remoteCollection: CollectionFragment | undefined
      if (dbCollection.contract_address !== null) {
        const contractAddress = dbCollection.contract_address.toLowerCase()

        remoteCollection = remoteCollections.find(
          (remoteCollection) =>
            remoteCollection.id.toLowerCase() === contractAddress
        )
      }

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
  ): Promise<FullItem[]> {
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

    const [dbResults, catalystItems] = await Promise.all([
      Collection.findByIds(collectionIds),
      peerAPI.fetchWearables(remoteItems.map((item) => item.urn)),
    ])

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

  // TODO: This being async is weird. Problem is that TP colletions are different from everything else.
  // An entity we can use to pass here to check if they're published doesn't exist. It should be the first items (or list of items)
  // So we can then check if it's length is bigger than 0
  static mergeTPCollection(
    collection: CollectionAttributes,
    lastItem: ThirdPartyItemFragment
  ): CollectionAttributes {
    return {
      ...collection,
      is_published: !!lastItem,
      reviewed_at: lastItem ? fromUnixTimestamp(lastItem.reviewedAt) : null,
      created_at: lastItem
        ? fromUnixTimestamp(lastItem.createdAt)
        : collection.created_at,
      updated_at: lastItem
        ? fromUnixTimestamp(lastItem.updatedAt)
        : collection.updated_at,
    }
  }

  static mergeItem(
    dbItem: ItemAttributes,
    remoteItem: ItemFragment,
    remoteCollection: CollectionFragment,
    catalystItem?: Wearable
  ): FullItem {
    const { wearable } = remoteItem.metadata

    const data = dbItem.data
    const category = data.category
    const rarity = wearable?.rarity || dbItem.rarity
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
      urn,
      rarity,
      in_catalyst,
      is_published: true,
      is_approved: remoteCollection.isApproved,
      price: remoteItem.price,
      beneficiary: remoteItem.beneficiary,
      blockchain_item_id: remoteItem.blockchainId,
      total_supply: Number(remoteItem.totalSupply),
      content_hash: remoteItem.contentHash || null,
      data: {
        ...data,
        category,
      },
    }
  }

  static toFullItem(
    dbItem: ItemAttributes,
    dbCollection?: CollectionAttributes
  ): FullItem {
    const hasURN = !!dbItem.urn_suffix

    return utils.omit(
      {
        ...dbItem,
        urn:
          hasURN && dbCollection && isTPCollection(dbCollection)
            ? buildTPItemURN(
                dbCollection.third_party_id,
                dbCollection.urn_suffix,
                dbItem.urn_suffix!
              )
            : null,
        in_catalyst: false,
        is_approved: false,
        is_published: false,
        total_supply: 0,
        content_hash: null,
      },
      ['urn_suffix']
    )
  }

  static indexById<T extends { id: string }>(
    list: (T | undefined)[]
  ): Record<string, T> {
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
