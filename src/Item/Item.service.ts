import { CollectionService } from '../Collection/Collection.service'

export class ItemService {
  private collectionService = new CollectionService()

  public async isOwnedOrManagedBy(
    id: string,
    ethAddress: string
  ): Promise<boolean> {
    const collection = await this.collectionService.findCollectionThatOwnsItem(
      id
    )
    return this.collectionService.isCollectionOwnedOrManagedBy(
      collection,
      ethAddress
    )
  }
}
