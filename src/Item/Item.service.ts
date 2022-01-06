import { Collection, CollectionAttributes } from '../Collection'
import { CollectionService } from '../Collection/Collection.service'
import { isTPCollection } from '../Collection/utils'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { ThirdPartyItemFragment } from '../ethereum/api/fragments'
import { peerAPI } from '../ethereum/api/peer'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Ownable } from '../Ownable'
import {
  CollectionForItemLockedError,
  ItemAction,
  NonExistentItemError,
  InconsistentItemError,
  DCLItemAlreadyPublishedError,
  ThirdPartyItemAlreadyPublishedError,
  ItemCantBeMovedFromCollectionError,
  UnauthorizedToUpsertError,
  UnauthorizedToChangeToCollection,
} from './Item.errors'
import { Item } from './Item.model'
import { FullItem, ItemAttributes } from './Item.types'
import {
  buildTPItemURN,
  getDecentralandItemURN,
  isTPItem,
  toDBItem,
} from './utils'

export class ItemService {
  private collectionService = new CollectionService()

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

  public async getTPItem(
    dbItem: ItemAttributes
  ): Promise<{ item: FullItem; collection?: CollectionAttributes }> {
    let item: FullItem = Bridge.toFullItem(dbItem)
    let collection: CollectionAttributes | undefined

    if (dbItem.collection_id) {
      collection = await Collection.findOne(dbItem.collection_id)

      if (collection && isTPCollection(collection)) {
        const urn = buildTPItemURN(
          collection.third_party_id,
          collection.urn_suffix,
          dbItem.urn_suffix!
        )

        const {
          thirdParty,
          item: lastItem,
        } = await thirdPartyAPI.fetchThirdPartyWithLastItem(
          collection.third_party_id,
          collection.urn_suffix
        )
        collection = thirdParty
          ? Bridge.mergeTPCollection(collection, thirdParty, lastItem)
          : collection

        const remoteItem = await thirdPartyAPI.fetchItem(urn)
        if (remoteItem) {
          const [catalystItem] = await peerAPI.fetchWearables([urn])
          item = Bridge.mergeTPItem(dbItem, remoteItem, catalystItem)
        }
      }
    }

    return { item, collection }
  }

  public async getDCLItem(
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

      const [remoteItem, remoteCollection] = await Promise.all([
        collectionAPI.fetchItem(
          dbCollection.contract_address!,
          dbItem.blockchain_item_id
        ),
        collectionAPI.fetchCollection(dbCollection.contract_address!),
      ])

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

  public async upsertItem(
    item: FullItem,
    eth_address: string
  ): Promise<FullItem> {
    return this.upsertDCLItem(item, eth_address)
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

    const itemURN = buildTPItemURN(
      dbCollection.third_party_id,
      dbCollection.urn_suffix,
      dbItem.urn_suffix!
    )
    if (await thirdPartyAPI.itemExists(itemURN)) {
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
    eth_address: string
  ): Promise<FullItem> {
    const canUpsert = await new Ownable(Item).canUpsert(item.id, eth_address)
    if (!canUpsert) {
      throw new UnauthorizedToUpsertError(item.id, eth_address)
    }

    const dbItem = await Item.findOne<ItemAttributes>(item.id)
    if (dbItem) {
      item.updated_at = new Date()
      item.created_at = dbItem.created_at
      this.checkItemIsMovedToAnotherCollection(item, dbItem)
    } else {
      item.created_at = new Date()
      item.updated_at = item.created_at
    }

    const collectionId = item.collection_id || dbItem?.collection_id
    const dbCollection = collectionId
      ? await this.collectionService.getDBCollection(collectionId)
      : undefined

    if (dbCollection) {
      const isCollectionOwnerDifferent =
        dbCollection.eth_address.toLowerCase() !== eth_address

      if (isCollectionOwnerDifferent) {
        throw new UnauthorizedToChangeToCollection(
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
    return Bridge.toFullItem(upsertedItem)
  }

  public async getTPItemsByManager(
    manager: string
  ): Promise<{
    dbTPItems: ItemAttributes[]
    remoteTPItems: ThirdPartyItemFragment[]
  }> {
    const thirdParties = await thirdPartyAPI.fetchThirdPartiesByManager(manager)
    if (thirdParties.length <= 0) {
      return { dbTPItems: [], remoteTPItems: [] }
    }

    const thirdPartyIds = thirdParties.map((thirdParty) => thirdParty.id)

    const [dbTPItems, remoteTPItems] = await Promise.all([
      Item.findByThirdPartyIds(thirdPartyIds),
      thirdPartyAPI.fetchItemsByThirdParties(thirdPartyIds),
    ])

    return {
      dbTPItems: dbTPItems.map((item) => ({ ...item, eth_address: manager })),
      remoteTPItems,
    }
  }

  splitItems(
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
}
