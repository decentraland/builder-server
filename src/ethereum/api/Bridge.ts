import { StandardWearable, ThirdPartyWearable } from '@dcl/schemas'
import { constants } from 'ethers'
import { utils } from 'decentraland-commons'
import {
  CollectionAttributes,
  Collection,
  ThirdPartyCollectionAttributes,
} from '../../Collection'
import { ItemAttributes, FullItem } from '../../Item'
import { fromUnixTimestamp } from '../../utils/parse'
import { buildTPItemURN } from '../../Item/utils'
import { decodeThirdPartyItemURN, isTPCollection } from '../../utils/urn'
import {
  ItemCuration,
  ItemCurationAttributes,
} from '../../Curation/ItemCuration'
import { ItemFragment, CollectionFragment } from './fragments'
import { collectionAPI } from './collection'
import { CatalystItem, peerAPI } from './peer'

export class Bridge {
  /**
   * Takes collections found in the database and combines each one with the data from the remote published (blockchain) collection counterpart
   * If no published collection is found, it'll be returned as-is.
   * For more info on what data is updated from the published item, see `Bridge.mergeCollection`
   * @param dbCollections - DB standard collections
   * @param remoteCollections - Blockchain standard collections
   */
  static async consolidateAllCollections(
    dbCollections: CollectionAttributes[],
    remoteCollections: CollectionFragment[]
  ): Promise<CollectionAttributes[]> {
    const collections: CollectionAttributes[] = []

    for (const dbCollection of dbCollections) {
      if (isTPCollection(dbCollection)) {
        collections.push(await this.consolidateTPCollection(dbCollection))
      } else {
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
    }

    return collections
  }

  /**
   * Takes a TP collection found in the database and combines it with the data from the last published item it has.
   * To get the published information, it'll check the last curation made to an item each collection has, as each curation is updated *after* being uploaded to the Catalyst.
   * If no published item is found or a non-TP collection is supplied, it'll be returned as-is.
   * For more info on what data is merged, see `Bridge.mergeTPCollection`
   * @param dbCollection - TP collection from the database
   */
  static async consolidateTPCollection(
    dbTPCollection: CollectionAttributes
  ): Promise<CollectionAttributes> {
    let fullCollection: CollectionAttributes = { ...dbTPCollection }

    if (isTPCollection(dbTPCollection)) {
      const lastItemCuration = await ItemCuration.findLastByCollectionId(
        dbTPCollection.id
      )
      if (lastItemCuration) {
        fullCollection = Bridge.mergeTPCollection(
          dbTPCollection,
          lastItemCuration
        )
      }
    }

    return fullCollection
  }

  /**
   * Takes TP items found in the database and it'll fetch the catalyst item for each one to combine their data.
   * If neither catalyst item or item curation are found the item will just be converted to FullItem and returned as-is.
   * For more info on how a full item looks, see `Bridge.toFullItem`. For more info on the merge see `Bridge.mergeTPItem`
   * @param dbItems - Database TP items
   * @param itemCurations - ItemCurationAttributes items
   * @param dbCollections - optional: the db collections corresponding to those items. If it's not provided, they will be retrieved from the database
   */
  static async consolidateTPItems(
    dbItems: ItemAttributes[],
    itemCurations: ItemCurationAttributes[],
    dbCollections?: CollectionAttributes[]
  ): Promise<FullItem[]> {
    const dbTPItemIds = dbItems.map((item) => item.collection_id!)
    const dbTPCollections = dbCollections
      ? dbCollections
      : await Collection.findByIds(dbTPItemIds)

    const dbTPCollectionsIndex = this.indexById(dbTPCollections)
    const itemCurationsIndex = this.indexBy(itemCurations, 'item_id')

    const itemsByURN: Record<string, ItemAttributes> = {}

    for (const item of dbItems) {
      const collection = dbTPCollectionsIndex[item.collection_id!]

      if (!collection || !isTPCollection(collection)) {
        throw new Error(`Could not find a valid collection for item ${item.id}`)
      }

      const urn = buildTPItemURN(
        collection.third_party_id,
        collection.urn_suffix,
        item.urn_suffix!
      )

      itemsByURN[urn] = item
    }

    const tpCatalystItems = await peerAPI.fetchWearables<ThirdPartyWearable>(
      Object.keys(itemsByURN)
    )

    const fullItems: FullItem[] = []

    for (const urn in itemsByURN) {
      const item = itemsByURN[urn]
      const itemCuration = itemCurationsIndex[item.id]
      let fullItem: FullItem

      const catalystItem = tpCatalystItems.find(
        (catalystItem) => catalystItem.id === urn
      )

      const collection = dbTPCollectionsIndex[item.collection_id!]
      if (itemCuration || catalystItem) {
        fullItem = Bridge.mergeTPItem(
          item,
          collection as ThirdPartyCollectionAttributes,
          catalystItem
        )
      } else {
        fullItem = Bridge.toFullItem(item, collection)
      }

      fullItems.push(fullItem)
    }

    return fullItems
  }

  /**
   * Combines the catalyst data and the item's DB data *into* a FullItem.
   * The db item is first converted to a FullItem and then the appropiate data is merged into it
   * @param dbItem - Database TP item
   * @param dbCollection - Database Collection item
   * @param catalystItem - Catalyst item
   */
  static mergeTPItem(
    dbItem: ItemAttributes,
    dbCollection: ThirdPartyCollectionAttributes,
    catalystItem?: ThirdPartyWearable
  ): FullItem {
    const data = dbItem.data
    const category = data.category
    const urn: string = catalystItem
      ? catalystItem.id
      : buildTPItemURN(
          dbCollection.third_party_id,
          dbCollection.urn_suffix,
          dbItem.urn_suffix!
        )

    return {
      ...Bridge.toFullItem(dbItem),
      // The total supply for TP items will be 0 as they won't be minted.
      total_supply: 0,
      // The price will remain as 0 as TP items will not be sold in the marketplace
      price: '0',
      // The benefiary will remain as the address zero as TP items will not be sold in the marketplace
      beneficiary: constants.AddressZero,
      // blockchain_item_id is not in the Catalyst, so we're using the token id from the URN
      blockchain_item_id: decodeThirdPartyItemURN(urn).item_urn_suffix,
      urn,
      in_catalyst: !!catalystItem,
      is_published: true,
      // For now, items are always approved. Rejecting (or disabling) items will be done at the record level, for all collections that apply.
      is_approved: !!catalystItem,
      content_hash: null,
      catalyst_content_hash: catalystItem
        ? catalystItem.merkleProof.entityHash
        : null,
      data: {
        ...data,
        category,
      },
    }
  }

  /**
   * Takes collections found in the database and combines each one with the data from the remote published (blockchain) collection counterpart
   * If no published collection is found, it'll be returned as-is.
   * For more info on what data is updated from the published item, see `Bridge.mergeCollection`
   * @param dbCollections - DB standard collections
   * @param remoteCollections - Blockchain standard collections
   */
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

  /**
   * Takes items found in the database and combines each one with the data from the remote published (blockchain) item counterpart
   * If the published item exists it'll fech the Catalyst item and use its data for the merge aswell.
   * If no published item is found, it'll be returned as-is.
   * For more info on what data is updated from the published item, see `Bridge.mergeItem`
   * @param dbItems - DB stantdard items
   * @param remoteItems - blockchain standard items (inside a collection)
   * @param dbCollections - optional: the db collections corresponding to those items. If it's not provided, they will be retrieved from the database
   */
  static async consolidateItems(
    dbItems: ItemAttributes[],
    remoteItems: ItemFragment[],
    dbCollections?: CollectionAttributes[]
  ): Promise<FullItem[]> {
    const items: FullItem[] = []

    // Get db collections from DB items
    const collectionIds = []
    for (const item of dbItems) {
      if (item.collection_id) {
        collectionIds.push(item.collection_id)
      }
    }

    const [dbResults, catalystItems] = await Promise.all([
      dbCollections
        ? Promise.resolve(dbCollections)
        : Collection.findByIds(collectionIds),
      peerAPI.fetchWearables<StandardWearable>(
        remoteItems.map((item) => item.urn)
      ),
    ])

    // Reduce it to a map for fast lookup
    const dbCollectionsIndex = this.indexById(dbResults)
    const catalystItemsIndex = this.indexById(catalystItems)

    for (let dbItem of dbItems) {
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

  /**
   * Takes a db standard collection and a published (blockchain) collection and combines the remote data *into* the db object
   * to get the updated information we don't store in the database (like if the collection is approved)
   * @param dbCollection - DB standard collection
   * @param remoteCollection - Blockchain collection
   */
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

  /**
   * Takes a db TP collection and the last curation an item has for this collection, and combines it *into* the db object
   * to get the updated information.
   * @param collection - TP db collection
   * @param lastItemCuration - Last item curation for the collection
   */
  static mergeTPCollection(
    collection: CollectionAttributes,
    lastItemCuration: ItemCurationAttributes
  ): CollectionAttributes {
    return {
      ...collection,
      is_published: true,
      reviewed_at: lastItemCuration.updated_at,
      created_at: lastItemCuration.created_at,
      updated_at: lastItemCuration.updated_at,
    }
  }

  /**
   * Takes a db standard item, a published (blockchain) data and the catalyst item and combines the remote data *into* the db object
   * to get the updated information we don't store in the database (like the price or if it's approved)
   * @param dbItem - DB standard item
   * @param remoteItem - Blockchain item
   * @param remoteCollection - Blockchain collection
   * @param catalystItem - Catalyst item
   */
  static mergeItem(
    dbItem: ItemAttributes,
    remoteItem: ItemFragment,
    remoteCollection: CollectionFragment,
    catalystItem?: CatalystItem
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
      catalyst_content_hash: null,
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
        content_hash: null,
        catalyst_content_hash: null,
        total_supply: 0,
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

  static indexBy<T extends Record<K, string>, K extends string>(
    list: (T | undefined)[],
    prop: K
  ): Record<string, T> {
    return list.reduce((obj, result) => {
      if (result) {
        const key = result[prop]
        obj[key as string] = result
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
