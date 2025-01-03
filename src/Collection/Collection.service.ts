import { v4 as uuid } from 'uuid'
import { collectionAPI } from '../ethereum/api/collection'
import { ItemFragment } from '../ethereum/api/fragments'
import { FactoryCollection } from '../ethereum/FactoryCollection'
import { Bridge } from '../ethereum/api/Bridge'
import { isPublished } from '../utils/eth'
import { InvalidRequestError } from '../utils/errors'
import { ThirdPartyService } from '../ThirdParty/ThirdParty.service'
import { Ownable } from '../Ownable'
import {
  Item,
  ItemAttributes,
  ThirdPartyItemAttributes,
  ItemApprovalData,
} from '../Item'
import {
  UnpublishedItemError,
  InconsistentItemError,
} from '../Item/Item.errors'
import { ItemCuration, ItemCurationAttributes } from '../Curation/ItemCuration'
import {
  SlotUsageCheque,
  SlotUsageChequeAttributes,
  Cheque,
} from '../SlotUsageCheque'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from '../Curation/CollectionCuration'
import { ThirdParty } from '../ThirdParty/ThirdParty.types'
import { CurationStatus } from '../Curation'
import { decodeTPCollectionURN, isTPCollection } from '../utils/urn'
import {
  getAddressFromSignature,
  getChequeMessageHash,
  toDBCollection,
} from './utils'
import {
  CollectionAttributes,
  FullCollection,
  PublishCollectionResponse,
  ThirdPartyCollectionAttributes,
} from './Collection.types'
import {
  Collection,
  CollectionWithCounts,
  FindCollectionParams,
} from './Collection.model'
import {
  CollectionAction,
  AlreadyPublishedCollectionError,
  LockedCollectionError,
  CollectionType,
  NonExistentCollectionError,
  UnauthorizedCollectionEditError,
  WrongCollectionError,
  UnpublishedCollectionError,
  InsufficientSlotsError,
  URNAlreadyInUseError,
} from './Collection.errors'

export class CollectionService {
  /**
   * Main Methods
   */

  public async getCollection(id: string): Promise<CollectionAttributes> {
    const dbCollection = await this.getDBCollection(id)

    return isTPCollection(dbCollection)
      ? this.getTPCollection(dbCollection)
      : this.getDCLCollection(dbCollection)
  }

  public async deleteCollection(collectionId: string): Promise<void> {
    const collection = await this.getDBCollection(collectionId)

    if (isTPCollection(collection)) {
      await this.checkIfThirdPartyCollectionHasPublishedItems(
        collection.id,
        CollectionAction.DELETE
      )
    } else {
      // If it's a DCL collection, we must check if it was already published
      if (await this.isDCLPublished(collection.contract_address!)) {
        throw new AlreadyPublishedCollectionError(
          collectionId,
          CollectionType.DCL,
          CollectionAction.DELETE
        )
      }
    }
    if (this.isLockActive(collection.lock)) {
      throw new LockedCollectionError(collection.id, CollectionAction.DELETE)
    }
    await Promise.all([
      Collection.delete({ id: collection.id }),
      // TODO: This should eventually be in the item's service
      Item.delete({ collection_id: collection.id }),
    ])
  }

  public async publishDCLCollection(
    dbCollection: CollectionAttributes,
    dbItems: ItemAttributes[]
  ): Promise<PublishCollectionResponse<CollectionAttributes>> {
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection!.contract_address!
    )

    if (!remoteCollection) {
      // This might be a problem with the graph lagging but we delegate the retry logic on the client
      throw new UnpublishedCollectionError(dbCollection.id)
    }

    const items: ItemAttributes[] = [...dbItems]
    let remoteItems: ItemFragment[] = []

    const isMissingBlockchainItemIds = dbItems.some(
      (item) => item.blockchain_item_id == null
    )

    if (isMissingBlockchainItemIds) {
      remoteItems = await collectionAPI.fetchItemsByContractAddress(
        dbCollection!.contract_address!
      )

      const updates = []

      for (const [index, item] of items.entries()) {
        const remoteItem = remoteItems.find(
          (remoteItem) => Number(remoteItem.blockchainId) === index
        )
        if (!remoteItem) {
          throw new UnpublishedItemError(item.id)
        }

        items[index].blockchain_item_id = remoteItem.blockchainId
        updates.push(
          Item.update(
            { blockchain_item_id: remoteItem.blockchainId },
            { id: item.id }
          )
        )
      }

      await Promise.all(updates)
    }

    return {
      collection: Bridge.mergeCollection(dbCollection!, remoteCollection),
      items: await Bridge.consolidateItems(items, remoteItems),
    }
  }

  /**
   * Publishes a TP collection by storing the slots cheque and creating the curations for the items to be published.
   * It creates or updates the virtual CollectionCuration for the items
   * @param dbCollection - Database TP collection
   * @param dbItems - Database TP items that belong to the collection
   * @param signerAddress - The address that signed the message
   * @param cheque - The cheque object containing the data signed
   */
  public async publishTPCollection(
    itemIds: string[],
    dbCollection: ThirdPartyCollectionAttributes,
    signerAddress: string,
    cheque: Cheque
  ): Promise<PublishCollectionResponse<CollectionAttributes>> {
    // For DCL collections, once a published collection item changes, the PUSH CHANGES button appears
    // That will fire a /collections/${collectionId}/curation which will create a new CollectionCuration
    // Subsequent changes will not show the push changes button, as it's already under_review

    // For TP items, curations always exist. PUSH CHANGES should appear if the item has an approved ItemCuration and has changes in the Catalyst
    // That should fire /items/:id/curation for each item that changed

    // There'll always be a publish before a PUSH CHANGES, so this method also creates or updates the virtual CollectionCuration for the items

    const availableSlots = await ThirdPartyService.getThirdPartyAvailableSlots(
      dbCollection.third_party_id
    )
    if (itemIds.length > availableSlots) {
      throw new InsufficientSlotsError(dbCollection.id)
    }

    const { signature, qty, salt } = cheque

    const dbItems = (await Item.findByIds(
      itemIds
    )) as ThirdPartyItemAttributes[]

    if (dbItems.length === 0) {
      throw new InvalidRequestError('Tried to publish no TP items')
    }

    if (qty !== dbItems.length) {
      throw new InvalidRequestError(
        'The check quantity is different from the amount of published items'
      )
    }

    try {
      const address = await getAddressFromSignature(
        cheque,
        dbCollection.third_party_id
      )

      if (signerAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error('Address missmatch')
      }
    } catch (error) {
      throw new InvalidRequestError(
        `Tried to publish TP items with an invalid signed message or signature. Error: ${
          (error as Error).message
        }`
      )
    }

    const collectionId = dbCollection.id
    const allTheSameCollection = dbItems.every(
      (item) => item.collection_id === collectionId
    )
    if (!allTheSameCollection) {
      throw new InvalidRequestError(
        'Cannot publish items that belong to different collections'
      )
    }

    const isPublished = await ItemCuration.findLastCreatedByCollectionIdAndStatus(
      collectionId,
      CurationStatus.PENDING
    )
    if (isPublished) {
      throw new AlreadyPublishedCollectionError(
        collectionId,
        CollectionType.THIRD_PARTY,
        CollectionAction.UPDATE
      )
    }

    const now = new Date()
    let itemCurationIds: string[] = []
    let itemCurations: ItemCurationAttributes[] = []
    let lastItemCuration: ItemCurationAttributes
    let newSlotUsageCheque: SlotUsageChequeAttributes | undefined

    try {
      newSlotUsageCheque = await SlotUsageCheque.create<SlotUsageChequeAttributes>(
        {
          id: uuid(),
          signature,
          qty,
          salt,
          collection_id: dbCollection.id,
          third_party_id: dbCollection.third_party_id,
          created_at: now,
          updated_at: now,
        }
      )

      const promises = []
      for (const item of dbItems) {
        const itemCuration: ItemCurationAttributes = {
          id: uuid(),
          item_id: item.id,
          status: CurationStatus.PENDING,
          content_hash: item.local_content_hash,
          created_at: now,
          updated_at: now,
          is_mapping_complete: item.mappings !== null,
        }
        itemCurationIds.push(itemCuration.id)
        promises.push(ItemCuration.create<ItemCurationAttributes>(itemCuration))
      }

      itemCurations = await Promise.all(promises)
      lastItemCuration = itemCurations.slice(-1)[0]

      const collectionCuration = await CollectionCuration.findOne(collectionId)
      if (collectionCuration) {
        await CollectionCuration.update(
          { id: collectionCuration.id },
          { updated_at: now }
        )
      } else {
        await CollectionCuration.create<CollectionCurationAttributes>({
          id: uuid(),
          collection_id: collectionId,
          status: CurationStatus.PENDING,
          created_at: now,
          updated_at: now,
          assignee: null,
        })
      }
    } catch (error) {
      // Rollback the cheque and all item curations just created in case any database interaction fails
      await Promise.all([
        newSlotUsageCheque
          ? SlotUsageCheque.delete({ id: newSlotUsageCheque.id })
          : null,
        ItemCuration.deleteByIds(itemCurationIds),
      ])

      throw new InvalidRequestError(
        `An error occurred trying to publish: ${(error as Error).message}`
      )
    }

    return {
      collection: Bridge.mergeTPCollection(dbCollection, lastItemCuration),
      items: await Bridge.consolidateTPItems(dbItems, itemCurations, [
        dbCollection,
      ]),
      itemCurations,
    }
  }

  public async upsertDCLCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection,
    data: string
  ): Promise<CollectionAttributes & { item_count: number }> {
    if (!data) {
      throw new WrongCollectionError(
        'Cannot upsert a collection without a valid data',
        { id, eth_address }
      )
    }

    if (collectionJSON.is_published || collectionJSON.is_approved) {
      throw new WrongCollectionError(
        'Cannot change the is_published or is_approved property',
        { id, eth_address }
      )
    }

    const canUpsert = await new Ownable(Collection).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new UnauthorizedCollectionEditError(id, eth_address)
    }

    const attributes = toDBCollection({
      ...collectionJSON,
      eth_address,
    })

    await this.checkIfNameIsValid(id, attributes.name)

    const collection = await Collection.findOne<CollectionAttributes>(id)

    if (collection && collection.contract_address) {
      if (await this.isDCLPublished(collection.contract_address)) {
        throw new AlreadyPublishedCollectionError(
          id,
          CollectionType.DCL,
          CollectionAction.UPDATE
        )
      }

      if (this.isLockActive(collection.lock)) {
        throw new LockedCollectionError(id, CollectionAction.UPDATE)
      }
    }

    const factoryCollection = new FactoryCollection()
    attributes.salt = factoryCollection.getSalt(id)
    attributes.contract_address = factoryCollection.getContractAddress(
      attributes.salt,
      data
    )

    return Collection.upsertWithItemCount(attributes)
  }

  public async upsertTPCollection(
    id: string,
    eth_address: string,
    collectionJSON: FullCollection
  ) {
    if (collectionJSON.urn === null) {
      throw new WrongCollectionError(
        'Invalid empty URN for third party collection',
        { id, eth_address, urn: collectionJSON.urn }
      )
    }

    const { third_party_id, urn_suffix } = decodeTPCollectionURN(
      collectionJSON.urn
    )

    const collection = await Collection.findOne<CollectionAttributes>(id)

    if (collection) {
      if (!isTPCollection(collection)) {
        throw new WrongCollectionError(
          "The collection can't be converted into a third party collection.",
          { id }
        )
      }

      // Check that the third party collection is not moved to another third party collection
      if (collection.third_party_id !== third_party_id) {
        throw new WrongCollectionError('The third party id cannot be changed', {
          id,
          eth_address,
          third_party_id,
        })
      }

      // Check that the given collection belongs to a manageable third party
      if (
        !(await ThirdPartyService.isManager(
          collection.third_party_id!,
          eth_address
        ))
      ) {
        throw new UnauthorizedCollectionEditError(id, eth_address)
      }

      // If the urn suffix is different, the collection's URN is being changed.
      if (urn_suffix !== collection.urn_suffix) {
        // We can't change the TP collection's URN if there are already published items
        await this.checkIfThirdPartyCollectionHasPublishedItems(id)

        // Check if the new URN for the collection already exists
        await this.checkIfThirdPartyCollectionURNExists(
          id,
          collectionJSON.urn,
          collection.third_party_id!,
          urn_suffix,
          CollectionAction.UPDATE
        )
      }
      if (this.isLockActive(collection.lock)) {
        throw new LockedCollectionError(id, CollectionAction.UPDATE)
      }
    } else {
      let thirdParty: ThirdParty | undefined
      try {
        thirdParty = await ThirdPartyService.getThirdParty(third_party_id)
      } catch (_) {}

      // When creating the collection, no third party exists, create a virtual one and assign the user as manager
      if (!thirdParty) {
        await ThirdPartyService.createVirtualThirdParty(
          third_party_id,
          [eth_address],
          {
            name: collectionJSON.name,
            description: '',
            contracts:
              collectionJSON.linked_contract_address &&
              collectionJSON.linked_contract_network
                ? [
                    {
                      network: collectionJSON.linked_contract_network,
                      address: collectionJSON.linked_contract_address.toLowerCase(),
                    },
                  ]
                : [],
          }
        )
        // Check that the given third party id is manageable by the user
      } else if (!thirdParty.managers.includes(eth_address.toLowerCase())) {
        throw new UnauthorizedCollectionEditError(id, eth_address)
      }

      // Check if the URN for the new collection already exists
      await this.checkIfThirdPartyCollectionURNExists(
        id,
        collectionJSON.urn,
        third_party_id,
        urn_suffix,
        CollectionAction.UPSERT
      )
    }

    const attributes = toDBCollection(collectionJSON)
    return Collection.upsertWithItemCount(attributes)
  }

  public async getApprovalData(id: string): Promise<ItemApprovalData> {
    const [collection, dbApprovalData, slotUsageCheque] = await Promise.all([
      this.getDBCollection(id),
      Item.findDBApprovalDataByCollectionId(id),
      SlotUsageCheque.findLastByCollectionId(id),
    ])

    if (!isTPCollection(collection)) {
      throw new WrongCollectionError('Collection is not Third Party', { id })
    }

    if (dbApprovalData.length === 0 || !slotUsageCheque) {
      throw new UnpublishedCollectionError(id)
    }

    const { qty, salt, signature } = slotUsageCheque

    const content_hashes = dbApprovalData.reduce((acc, data) => {
      if (!data.content_hash) {
        throw new InconsistentItemError(
          data.id,
          'Item missing the content_hash needed to approve it'
        )
      }
      acc[data.id] = data.content_hash
      return acc
    }, {} as Record<string, string>)

    const slotUsageCheckHash = await getChequeMessageHash(
      slotUsageCheque,
      slotUsageCheque.third_party_id
    )

    const [thirdParty, remoteCheque] = await Promise.all([
      ThirdPartyService.getThirdParty(collection.third_party_id),
      ThirdPartyService.fetchReceiptById(slotUsageCheckHash),
    ])

    return {
      cheque: {
        qty,
        salt,
        signature,
      },
      root: thirdParty?.root ?? null,
      content_hashes,
      chequeWasConsumed: remoteCheque?.id === slotUsageCheckHash,
    }
  }

  /**
   * Helpers
   */

  public isLockActive(lock: Date | null) {
    if (!lock) {
      return false
    }

    const deadline = new Date(lock)
    deadline.setDate(deadline.getDate() + 1)

    return deadline.getTime() > Date.now()
  }

  public async isDCLPublished(contractAddress: string) {
    // First check if collection has items with blockchain id, if so, it means it's already published.
    const hasPublishedItems = await Item.hasPublishedItems(contractAddress)
    if (hasPublishedItems) {
      return true
    }

    // We check against the blockchain directly first to avoid mishaps with thegraph
    // If the contract exists, then the collection is published.
    const isBlockchainPublished = await isPublished(contractAddress)
    if (isBlockchainPublished) {
      return true
    }

    // If not, the collection could exist but the user hasn't called /collections/:collection_id/publish yet, so we check if it exists in the subgraph. If it exists, then it is published.
    const remoteCollection = await collectionAPI.fetchCollection(
      contractAddress
    )
    return !!remoteCollection
  }

  public async isDCLManager(id: string, ethAddress: string): Promise<boolean> {
    const collection = await this.getCollection(id)

    return collection && this.isDCLManagerOfCollection(collection, ethAddress)
  }

  public isDCLManagerOfCollection(
    collection: CollectionAttributes,
    ethAddress: string
  ): boolean {
    return collection.managers.some((manager) => manager === ethAddress)
  }

  public async isOwnedOrManagedBy(
    id: string,
    ethAddress: string
  ): Promise<boolean> {
    const collection = await Collection.findOne<CollectionAttributes>(id)
    if (collection && isTPCollection(collection)) {
      return ThirdPartyService.isManager(collection.third_party_id!, ethAddress)
    } else if (collection) {
      return (
        collection.eth_address === ethAddress ||
        this.isDCLManager(id, ethAddress)
      )
    }

    return false
  }

  public async getCollections(
    params: FindCollectionParams,
    manager?: string
  ): Promise<CollectionWithCounts[]> {
    const thirdParties = manager
      ? await ThirdPartyService.getThirdParties(manager)
      : await ThirdPartyService.getThirdParties()
    const thirdPartyById = thirdParties.reduce((acc, thirdParty) => {
      acc[thirdParty.id] = thirdParty
      return acc
    }, {} as Record<string, ThirdParty>)
    const thirdPartyIds = Object.keys(thirdPartyById)
    let allCollections = await Collection.findAll({
      ...params,
      thirdPartyIds,
    })

    // Verify collections ownership
    if (params.address !== undefined) {
      const collectionsIds = allCollections.map(
        (collection) => collection.contract_address!
      )
      const remoteCollections = await collectionAPI.fetchCollections({
        ids: collectionsIds,
      })

      if (remoteCollections.length > 0) {
        // Create a map of remote collections for fast lookup
        const remoteCollectionMap = Object.fromEntries(
          remoteCollections.map(({ id, creator, managers, minters }) => [
            id,
            { creator, managers, minters },
          ])
        )

        // If exists the remote collection, filter by the creator field or the managers field or the minters field
        allCollections = allCollections.filter(
          ({ contract_address }) =>
            !remoteCollectionMap[contract_address!] ||
            remoteCollectionMap[contract_address!].creator ===
              params.address! ||
            remoteCollectionMap[contract_address!].managers.includes(
              params.address!
            ) ||
            remoteCollectionMap[contract_address!].minters.includes(
              params.address!
            )
        )
      }
    }

    // Set if the collection is programmatic
    for (const collection of allCollections) {
      if (
        collection.third_party_id &&
        thirdPartyById[collection.third_party_id]
      ) {
        collection.is_programmatic =
          thirdPartyById[collection.third_party_id].isProgrammatic
      }
    }
    return allCollections
  }

  public async getDbTPCollections(): Promise<CollectionAttributes[]> {
    const thirdParties = await ThirdPartyService.getThirdParties()
    return this.getDbTPCollectionsByThirdParties(thirdParties)
  }

  public async getDbTPCollectionsByManager(
    manager: string
  ): Promise<CollectionAttributes[]> {
    const thirdParties = await ThirdPartyService.getThirdParties(manager)
    return this.getDbTPCollectionsByThirdParties(thirdParties)
  }

  public async getDBCollection(
    collectionId: string
  ): Promise<CollectionAttributes> {
    const collections = await Collection.findByIds([collectionId])
    if (!collections.length) {
      throw new NonExistentCollectionError(collectionId)
    }

    return collections[0]
  }

  /**
   * Private methods
   */

  private async getDbTPCollectionsByThirdParties(
    thirdParties: ThirdParty[]
  ): Promise<CollectionAttributes[]> {
    if (thirdParties.length <= 0) {
      return []
    }
    const thirdPartyIds = thirdParties.map((thirdParty) => thirdParty.id)

    return Collection.findByThirdPartyIds(thirdPartyIds)
  }

  private async getTPCollection(
    dbCollection: ThirdPartyCollectionAttributes
  ): Promise<CollectionAttributes & { is_programmatic: boolean }> {
    const lastItemCuration = await ItemCuration.findLastByCollectionId(
      dbCollection.id
    )

    const thirdParty = await ThirdPartyService.getThirdParty(
      dbCollection.third_party_id
    )

    const collection = lastItemCuration
      ? Bridge.mergeTPCollection(dbCollection, lastItemCuration)
      : dbCollection
    return {
      ...collection,
      is_programmatic: thirdParty?.isProgrammatic ?? false,
    }
  }

  private async getDCLCollection(
    dbCollection: CollectionAttributes
  ): Promise<CollectionAttributes> {
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection.contract_address!
    )

    return remoteCollection
      ? Bridge.mergeCollection(dbCollection, remoteCollection)
      : dbCollection
  }

  private async checkIfNameIsValid(id: string, name: string): Promise<void> {
    if (!(await Collection.isValidName(id, name.trim()))) {
      throw new WrongCollectionError('Name already in use', { id, name })
    }
  }

  private async checkIfThirdPartyCollectionHasPublishedItems(
    id: string,
    action = CollectionAction.UPSERT
  ): Promise<void> {
    if (await ItemCuration.existsByCollectionId(id)) {
      throw new AlreadyPublishedCollectionError(
        id,
        CollectionType.THIRD_PARTY,
        action
      )
    }
  }

  private async checkIfThirdPartyCollectionURNExists(
    id: string,
    urn: string,
    third_party_id: string,
    urn_suffix: string,
    action = CollectionAction.UPSERT
  ): Promise<void> {
    if (await Collection.isURNRepeated(id, third_party_id, urn_suffix)) {
      throw new URNAlreadyInUseError(id, urn, action)
    }
  }
}
