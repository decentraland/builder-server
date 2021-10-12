import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { collectionAPI } from '../ethereum/api/collection'
import { isPublished } from '../utils/eth'
import { isManager as isTPWManger } from '../ethereum/api/tpw'
import { FactoryCollection } from '../ethereum/FactoryCollection'
import { Ownable } from '../Ownable'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { toDBCollection, decodeTPCollectionURN } from './utils'
import { Collection } from './Collection.model'

const DAY = 1000 * 60 * 60 * 24
export class CollectionService {
  isLockActive(lock: Date | null) {
    if (!lock) {
      return false
    }

    const deadline = new Date(lock)
    return deadline.getTime() + DAY > Date.now()
  }

  private async checkIfNameIsValid(
    id: string,
    name: string,
    urn_suffix?: string
  ): Promise<void> {
    if (!(await Collection.isValidName(id, name.trim(), urn_suffix))) {
      throw new HTTPError(
        'Name already in use',
        { id, name },
        STATUS_CODES.conflict
      )
    }
  }

  async upsertDCLCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection,
    data: string
  ): Promise<CollectionAttributes> {
    if (collectionJSON.is_published || collectionJSON.is_approved) {
      throw new HTTPError(
        'Can not change the is_published or is_approved property',
        { id, eth_address },
        STATUS_CODES.conflict
      )
    }

    const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new HTTPError(
        'Unauthorized',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const attributes = toDBCollection({
      ...collectionJSON,
      eth_address,
    })

    await this.checkIfNameIsValid(id, attributes.name)

    const collection = await Collection.findOne<CollectionAttributes>(id)

    if (collection) {
      if (await this.isPublished(collection.contract_address)) {
        throw new HTTPError(
          "The collection is published. It can't be saved",
          { id },
          STATUS_CODES.conflict
        )
      }

      if (this.isLockActive(collection.lock)) {
        throw new HTTPError(
          "The collection is locked. It can't be saved",
          { id },
          STATUS_CODES.locked
        )
      }
    }

    const factoryCollection = new FactoryCollection()
    attributes.salt = factoryCollection.getSalt(id)
    attributes.contract_address = factoryCollection.getContractAddress(
      attributes.salt,
      data
    )

    return new Collection(attributes).upsert()
  }

  async upsertTPWCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection
  ) {
    const [, urn_suffix] = decodeTPCollectionURN(collectionJSON.urn)
    if (!(await isTPWManger(collectionJSON.urn, eth_address))) {
      throw new HTTPError(
        'Unauthorized',
        { id, urn: collectionJSON.urn, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    // should names be shared with the other collections?
    await this.checkIfNameIsValid(id, collectionJSON.name, urn_suffix)

    const collection = await Collection.findOne<CollectionAttributes>(id)
    if (collection) {
      if (this.isLockActive(collection.lock)) {
        throw new HTTPError(
          "The collection is locked. It can't be saved",
          { id },
          STATUS_CODES.locked
        )
      }
    }

    const attributes = toDBCollection(collectionJSON)
    // Should we do something with the salt and the contract address? There's no need to have them
    return new Collection(attributes).upsert()
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
