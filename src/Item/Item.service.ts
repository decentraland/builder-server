import { CollectionService } from '../Collection/Collection.service'
import { Item } from './Item.model'
import { ItemAttributes } from './Item.types'

export class ItemService {
  private collectionService = new CollectionService()

  public async isOwnedOrManagedBy(
    id: string,
    ethAddress: string
  ): Promise<boolean> {
    const dbItem = await Item.findOne<ItemAttributes>(id)
    if (!dbItem) {
      return false
    } else if (dbItem.urn_suffix && dbItem.collection_id) {
      return this.collectionService.isOwnedOrManagedBy(
        dbItem?.collection_id,
        ethAddress
      )
    } else {
      return dbItem.eth_address === dbItem.eth_address
    }
  }
}
