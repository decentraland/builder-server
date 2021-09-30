import { Collection, CollectionAttributes } from '../Collection'
import { collectionAPI } from '../ethereum/api/collection'
import { isPublished } from '../utils/eth'

export class CollectionService {
  async isLocked(collectionId: string) {
    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )

    if (!collection || !collection.lock) {
      return false
    }

    const deadline = new Date(collection.lock)
    deadline.setDate(deadline.getDate() + 1)

    return (
      deadline.getTime() > Date.now() &&
      !(await this.isPublished(collection.contract_address)) // TODO: This is not yet considering third party wearables
    )
  }

  async isPublished(contractAddress: string) {
    const remoteCollection = await collectionAPI.fetchCollection(
      contractAddress
    )

    // Fallback: check against the blockchain, in case the subgraph is lagging
    if (!remoteCollection) {
      const isCollectionPublished = await isPublished(contractAddress)
      return isCollectionPublished
    }

    return true
  }
}
