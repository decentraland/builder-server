import { CollectionService } from '../Collection/Collection.service'
import { isTPCollection } from '../Collection/utils'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import {
  CollectionForItemLockedError,
  ItemAction,
  NonExistentItemError,
  InconsistentItemError,
  DCLItemAlreadyPublishedError,
  ThirdPartyItemAlreadyPublishedError,
} from './Item.errors'
import { Item } from './Item.model'
import { ItemAttributes } from './Item.types'
import { buildTPItemURN, isTPItem } from './utils'

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
        dbItem.collection_id!,
        ethAddress
      )
    } else {
      return dbItem.eth_address === dbItem.eth_address
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
          dbItem.blockchain_item_id!,
          dbCollection.contract_address!,
          ItemAction.DELETE
        )
      }
      if (await this.collectionService.isLockActive(dbCollection.lock)) {
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

    if (isTPCollection(dbCollection)) {
      throw new InconsistentItemError(
        dbItem.id,
        "The third party item does't belong to a third party collection"
      )
    }

    if (await this.collectionService.isLockActive(dbCollection.lock)) {
      throw new CollectionForItemLockedError(dbItem.id, ItemAction.DELETE)
    }

    const itemURN = buildTPItemURN(
      dbCollection.third_party_id!,
      dbCollection.urn_suffix!,
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
}
