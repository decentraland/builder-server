import { CollectionAttributes } from '../Collection'
import { Collection } from '../Collection/Collection.model'
import { getThirdPartyCollectionURN } from '../Collection/utils'
import { isManager } from '../ethereum/api/tpw'
import { Item } from '../Item/Item.model'
import { OwnableModel } from './Ownable.types'

export class Ownable {
  Model: OwnableModel

  constructor(Model: OwnableModel) {
    this.Model = Model
  }

  async isOwnedBy(id: string, ethAddress: string): Promise<boolean> {
    if (!(this.Model instanceof Collection) && !(this.Model instanceof Item)) {
      return (await this.Model.count({ id, eth_address: ethAddress })) > 0
    }
    let collection: CollectionAttributes | undefined

    // Collections and items must be treated differently
    if (this.Model instanceof Collection) {
      collection = await Collection.findOne<CollectionAttributes>(id)
    } else {
      try {
        collection = await Collection.findByOwnerOfItem(id)
      } catch (_) {
        return false
      }
    }

    if (collection && collection.urn_suffix) {
      return isManager(
        getThirdPartyCollectionURN(collection.urn_suffix),
        ethAddress
      )
    } else if (collection) {
      return collection.eth_address === ethAddress
    }
    return false
  }

  async canUpsert(id: string, ethAddress: string): Promise<boolean> {
    const [count, isOwner] = await Promise.all([
      this.Model.count({ id }),
      this.isOwnedBy(id, ethAddress),
    ])
    return count === 0 || isOwner
  }
}
