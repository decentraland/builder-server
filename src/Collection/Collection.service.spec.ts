import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
  thirdPartyMock,
} from '../../spec/mocks/collections'
import { wallet } from '../../spec/mocks/wallet'
import { ThirdPartyService } from '../ThirdParty/ThirdParty.service'
import { ItemCuration } from '../Curation/ItemCuration'
import { ThirdParty } from '../ThirdParty/ThirdParty.types'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { UnauthorizedCollectionEditError } from './Collection.errors'
import { toFullCollection } from './utils'
import { isCommitteeMember } from '../Committee'
import { collectionAPI } from '../ethereum/api/collection'
import { Bridge } from '../ethereum/api/Bridge'
import { Item } from '../Item/Item.model'

jest.mock('./Collection.model')
jest.mock('../Item/Item.model')
jest.mock('../ThirdParty/ThirdParty.service')
jest.mock('../Curation/ItemCuration/ItemCuration.model')
jest.mock('../Committee')

describe('Collection service', () => {
  let service: CollectionService

  beforeEach(() => {
    service = new CollectionService()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  describe('when checking if an address is a DCL manager of a collection', () => {
    const lowercased = '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd9'
    const checksummed = '0xC6d2000A7a1DdCA92941f4E2b41360Fe4Ee2ABd9'

    it('should match the address against the managers case-insensitively', () => {
      const collection = {
        ...dbCollectionMock,
        managers: [lowercased],
      } as CollectionAttributes
      expect(service.isDCLManagerOfCollection(collection, checksummed)).toBe(
        true
      )
    })

    it('should return false when the address is not a manager', () => {
      const collection = {
        ...dbCollectionMock,
        managers: [lowercased],
      } as CollectionAttributes
      expect(
        service.isDCLManagerOfCollection(
          collection,
          '0x1111111111111111111111111111111111111111'
        )
      ).toBe(false)
    })
  })

  describe('when checking if an address can sync a collection publication', () => {
    const otherAddress = '0x1111111111111111111111111111111111111111'

    afterEach(() => {
      ;(isCommitteeMember as jest.Mock).mockReset()
    })

    describe('and the collection does not exist', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(undefined)
      })

      it('should return false', async () => {
        expect(
          await service.canSyncPublication(dbCollectionMock.id, wallet.address)
        ).toBe(false)
      })
    })

    describe('and the collection is a standard collection', () => {
      describe('and the address is the owner', () => {
        beforeEach(() => {
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbCollectionMock
          )
        })

        it('should return true', async () => {
          expect(
            await service.canSyncPublication(
              dbCollectionMock.id,
              dbCollectionMock.eth_address
            )
          ).toBe(true)
        })
      })

      describe('and the address is a committee member', () => {
        beforeEach(() => {
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbCollectionMock
          )
          ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
        })

        it('should return true', async () => {
          expect(
            await service.canSyncPublication(dbCollectionMock.id, otherAddress)
          ).toBe(true)
        })
      })

      describe('and the address is a manager of the published collection', () => {
        beforeEach(() => {
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbCollectionMock
          )
          ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(false)
          jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce({
            ...collectionFragmentMock,
            managers: [otherAddress],
          })
        })

        it('should return true', async () => {
          expect(
            await service.canSyncPublication(dbCollectionMock.id, otherAddress)
          ).toBe(true)
        })
      })

      describe('and the address became the owner on-chain but is not stored as such yet', () => {
        beforeEach(() => {
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbCollectionMock
          )
          ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(false)
          jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce({
            ...collectionFragmentMock,
            creator: otherAddress,
          })
        })

        it('should return true', async () => {
          expect(
            await service.canSyncPublication(dbCollectionMock.id, otherAddress)
          ).toBe(true)
        })
      })

      describe('and the address is neither the owner, a manager nor a committee member', () => {
        beforeEach(() => {
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbCollectionMock
          )
          ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(false)
          jest
            .spyOn(collectionAPI, 'fetchCollection')
            .mockResolvedValueOnce(collectionFragmentMock)
        })

        it('should return false', async () => {
          expect(
            await service.canSyncPublication(dbCollectionMock.id, otherAddress)
          ).toBe(false)
        })
      })
    })

    describe('and the collection is a third party collection', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbTPCollectionMock
        )
        ;(isCommitteeMember as jest.Mock).mockResolvedValue(true)
      })

      describe('and the address is a committee member but not a manager', () => {
        beforeEach(() => {
          ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(
            false
          )
        })

        it('should return false', async () => {
          expect(
            await service.canSyncPublication(
              dbTPCollectionMock.id,
              otherAddress
            )
          ).toBe(false)
        })
      })

      describe('and the address is a manager of the third party', () => {
        beforeEach(() => {
          ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(
            true
          )
        })

        it('should return true', async () => {
          expect(
            await service.canSyncPublication(
              dbTPCollectionMock.id,
              otherAddress
            )
          ).toBe(true)
        })
      })
    })
  })

  describe('when syncing the owner of a collection from chain', () => {
    const newOwner = '0x00000000000000000000000000000000000000AA'
    let collection: CollectionAttributes

    beforeEach(() => {
      collection = { ...dbCollectionMock }
    })

    describe('and the collection is not published', () => {
      beforeEach(() => {
        collection.contract_address = null
        jest.spyOn(collectionAPI, 'fetchCollection')
      })

      it('should return the collection untouched', async () => {
        await expect(service.syncOwnerFromChain(collection)).resolves.toBe(
          collection
        )
        expect(collectionAPI.fetchCollection).not.toHaveBeenCalled()
        expect(Collection.update).not.toHaveBeenCalled()
      })
    })

    describe('and the subgraph does not know the collection yet', () => {
      beforeEach(() => {
        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce(null)
      })

      it('should return the collection untouched', async () => {
        await expect(service.syncOwnerFromChain(collection)).resolves.toBe(
          collection
        )
        expect(Collection.update).not.toHaveBeenCalled()
      })
    })

    describe('and the on-chain creator is the stored owner', () => {
      beforeEach(() => {
        jest
          .spyOn(collectionAPI, 'fetchCollection')
          .mockResolvedValueOnce(collectionFragmentMock)
      })

      it('should return the merged collection without touching the database', async () => {
        await expect(service.syncOwnerFromChain(collection)).resolves.toEqual(
          Bridge.mergeCollection(dbCollectionMock, collectionFragmentMock)
        )
        expect(Collection.update).not.toHaveBeenCalled()
        expect(Item.update).not.toHaveBeenCalled()
      })
    })

    describe('and the ownership was transferred on-chain', () => {
      beforeEach(() => {
        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce({
          ...collectionFragmentMock,
          creator: newOwner,
        })
      })

      it('should store the new owner, lowercased, on the collection and its items', async () => {
        await service.syncOwnerFromChain(collection)
        expect(Item.update).toHaveBeenCalledWith(
          { eth_address: newOwner.toLowerCase() },
          { collection_id: collection.id }
        )
        expect(Collection.update).toHaveBeenCalledWith(
          { eth_address: newOwner.toLowerCase() },
          { id: collection.id }
        )
      })

      it('should return the collection owned by the new owner', () => {
        return expect(service.syncOwnerFromChain(collection)).resolves.toEqual(
          expect.objectContaining({ eth_address: newOwner })
        )
      })

      describe('and storing the new owner of the items fails', () => {
        beforeEach(() => {
          ;(Item.update as jest.Mock).mockRejectedValueOnce(
            new Error('timeout')
          )
        })

        it('should throw and leave the collection on the previous owner, so the next sync retries', async () => {
          await expect(service.syncOwnerFromChain(collection)).rejects.toThrow(
            'timeout'
          )
          expect(Collection.update).not.toHaveBeenCalled()
        })
      })
    })
  })

  describe('when checking if an address owns or manages a collection', () => {
    const newOwner = '0x00000000000000000000000000000000000000aa'

    describe('and the collection does not exist', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(undefined)
      })

      it('should return false', () => {
        return expect(
          service.isOwnedOrManagedBy(dbCollectionMock.id, wallet.address)
        ).resolves.toBe(false)
      })
    })

    describe('and the collection is a third party collection', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbTPCollectionMock
        )
        ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(true)
      })

      it('should answer with whether the address manages the third party', () => {
        return expect(
          service.isOwnedOrManagedBy(dbTPCollectionMock.id, wallet.address)
        ).resolves.toBe(true)
      })
    })

    describe('and the collection was transferred on-chain to the address', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
          ...dbCollectionMock,
        })
        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce({
          ...collectionFragmentMock,
          creator: newOwner,
        })
      })

      it('should allow the new owner and store it', async () => {
        await expect(
          service.isOwnedOrManagedBy(dbCollectionMock.id, newOwner)
        ).resolves.toBe(true)
        expect(Collection.update).toHaveBeenCalledWith(
          { eth_address: newOwner },
          { id: dbCollectionMock.id }
        )
      })
    })

    describe('and the collection was transferred on-chain away from the address', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
          ...dbCollectionMock,
        })
        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce({
          ...collectionFragmentMock,
          creator: newOwner,
        })
      })

      it('should refuse the previous owner', () => {
        return expect(
          service.isOwnedOrManagedBy(
            dbCollectionMock.id,
            dbCollectionMock.eth_address
          )
        ).resolves.toBe(false)
      })
    })

    describe('and the subgraph cannot be reached', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbCollectionMock
        )
        jest
          .spyOn(collectionAPI, 'fetchCollection')
          .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        jest.spyOn(console, 'error').mockImplementation(() => undefined)
      })

      it('should fall back to the stored owner', () => {
        return expect(
          service.isOwnedOrManagedBy(
            dbCollectionMock.id,
            dbCollectionMock.eth_address
          )
        ).resolves.toBe(true)
      })
    })
  })

  describe('when checking if the lock is active', () => {
    const twoDaysInMilliseconds = 2 * 24 * 60 * 60 * 1000
    const thrityMinutesInMilliseconds = 30 * 60 * 1000

    describe('when the collection does not have a lock set', () => {
      it('should return false', () => {
        expect(service.isLockActive(null)).toBe(false)
      })
    })

    describe('when the collection is locked with a date older than a day', () => {
      let lock: Date

      beforeEach(() => {
        lock = new Date()
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(Date.now() + twoDaysInMilliseconds)
      })

      afterAll(() => {
        // Just in case something goes wrong with the test and the Date.now function never gets executed.
        jest.restoreAllMocks()
      })

      it('should return false', () => {
        expect(service.isLockActive(lock)).toBe(false)
      })
    })

    describe('when the collection is locked with a date sooner than a day', () => {
      let lock: Date

      beforeEach(() => {
        lock = new Date(Date.now() + thrityMinutesInMilliseconds)
      })

      it('should return true', () => {
        expect(service.isLockActive(lock)).toBe(true)
      })
    })
  })

  describe('when getting the database TP collections', () => {
    let thirdParties: ThirdParty[]

    beforeEach(() => {
      thirdParties = [thirdPartyMock, { ...thirdPartyMock, id: 'nonsense-id' }]
      ;(Collection.findByThirdPartyIds as jest.Mock).mockReturnValueOnce([
        dbTPCollectionMock,
      ])
    })

    describe('when searching all collections', () => {
      beforeEach(() => {
        ;(ThirdPartyService.getThirdParties as jest.Mock).mockResolvedValueOnce(
          thirdParties
        )
      })

      it('should return the db third party collections for all managers', async () => {
        expect(await service.getDbTPCollections()).toEqual([dbTPCollectionMock])
      })

      it('should try to fetch db collections with all the ids', async () => {
        await service.getDbTPCollections()

        const ids = thirdParties.map((fragment) => fragment.id)
        expect(Collection.findByThirdPartyIds).toHaveBeenCalledWith(ids)
      })
    })

    describe('when searching by a specific manager', () => {
      beforeEach(() => {
        ;(ThirdPartyService.getThirdParties as jest.Mock).mockResolvedValueOnce(
          thirdParties
        )
      })

      it('should return the db third party collections for the supplied manager', async () => {
        expect(
          await service.getDbTPCollectionsByManager(wallet.address)
        ).toEqual([dbTPCollectionMock])
      })

      it('should try to fetch db collections for the manager the ids', async () => {
        await service.getDbTPCollectionsByManager(wallet.address)

        const ids = thirdParties.map((fragment) => fragment.id)
        expect(Collection.findByThirdPartyIds).toHaveBeenCalledWith(ids)
      })
    })
  })

  describe('when getting a collection by id', () => {
    let thirdParty: ThirdParty
    let collection: CollectionAttributes

    describe('and the collection is a third party collection', () => {
      beforeEach(() => {
        collection = { ...dbTPCollectionMock }
        thirdParty = {
          ...thirdPartyMock,
          id: dbTPCollectionMock.third_party_id,
        }
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([collection])
      })

      beforeEach(() => {
        ;(ItemCuration.findLastByCollectionId as jest.Mock).mockResolvedValueOnce(
          undefined
        )
        ;(ThirdPartyService.getThirdParty as jest.Mock).mockResolvedValueOnce(
          thirdParty
        )
      })

      describe('and the third party is programmatic', () => {
        beforeEach(() => {
          thirdParty.isProgrammatic = true
        })

        it('should return the collection with the isProgrammatic property set', () => {
          return expect(service.getCollection(collection.id)).resolves.toEqual({
            ...collection,
            is_programmatic: true,
          })
        })
      })

      describe('and the third party is not programmatic', () => {
        beforeEach(() => {
          thirdParty.isProgrammatic = false
        })

        it('should return the collection with the isProgrammatic property set', () => {
          return expect(service.getCollection(collection.id)).resolves.toEqual({
            ...collection,
            is_programmatic: false,
          })
        })
      })
    })
  })

  describe('when getting all collections', () => {
    let collections: CollectionAttributes[]
    let thirdParties: ThirdParty[]

    describe('and the collections are third party collections', () => {
      beforeEach(() => {
        collections = [
          dbTPCollectionMock,
          { ...dbTPCollectionMock, third_party_id: 'another-db-tp-collection' },
        ]
        thirdParties = [
          {
            ...thirdPartyMock,
            id: dbTPCollectionMock.third_party_id,
            isProgrammatic: false,
          },
          {
            ...thirdPartyMock,
            id: 'another-db-tp-collection',
            isProgrammatic: true,
          },
        ]
        ;(Collection.findAll as jest.Mock).mockResolvedValueOnce(collections)
        ;(ThirdPartyService.getThirdParties as jest.Mock).mockResolvedValueOnce(
          thirdParties
        )
      })

      it('should return the collections with its is programmatic property set', () => {
        return expect(
          service.getCollections({}, wallet.address)
        ).resolves.toEqual([
          { ...collections[0], is_programmatic: false },
          { ...collections[1], is_programmatic: true },
        ])
      })
    })
  })

  describe('when upserting a collection under an existing third party', () => {
    let fullCollection: FullCollection
    let ethAddress: string

    beforeEach(() => {
      ethAddress = wallet.address
      fullCollection = toFullCollection(dbTPCollectionMock)
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(undefined)
      ;(ThirdPartyService.getThirdParty as jest.Mock).mockResolvedValueOnce(
        thirdPartyMock
      )
      ;(Collection.isURNRepeated as jest.Mock).mockResolvedValueOnce(false)
      ;(Collection.upsertWithItemCount as jest.Mock).mockResolvedValueOnce(
        dbTPCollectionMock
      )
    })

    describe('and the wallet is a manager of the third party', () => {
      beforeEach(() => {
        ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(true)
      })

      it('should upsert the collection', () => {
        return expect(
          service.upsertTPCollection(
            dbTPCollectionMock.id,
            ethAddress,
            fullCollection
          )
        ).resolves.toEqual(dbTPCollectionMock)
      })

      it('should add the collection contract to the virtual third party', async () => {
        await service.upsertTPCollection(
          dbTPCollectionMock.id,
          ethAddress,
          fullCollection
        )
        expect(
          ThirdPartyService.syncVirtualThirdPartyContracts
        ).toHaveBeenCalledWith(dbTPCollectionMock.third_party_id, null, {
          network: dbTPCollectionMock.linked_contract_network,
          address: dbTPCollectionMock.linked_contract_address!.toLowerCase(),
        })
      })
    })

    describe('and the wallet is not a manager of the third party', () => {
      beforeEach(() => {
        ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(false)
      })

      it('should reject with the UnauthorizedCollectionEditError error', () => {
        return expect(
          service.upsertTPCollection(
            dbTPCollectionMock.id,
            ethAddress,
            fullCollection
          )
        ).rejects.toThrow(UnauthorizedCollectionEditError)
      })
    })
  })

  describe('when updating an existing third party collection', () => {
    let fullCollection: FullCollection

    beforeEach(() => {
      fullCollection = toFullCollection(dbTPCollectionMock)
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
        dbTPCollectionMock
      )
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.upsertWithItemCount as jest.Mock).mockResolvedValueOnce(
        dbTPCollectionMock
      )
    })

    describe('and the linked contract changes', () => {
      beforeEach(() => {
        fullCollection.linked_contract_address =
          '0x77372A4CC66063575B05B44481F059BE356964A4'
      })

      it('should sync the virtual third party with the new contract', async () => {
        await service.upsertTPCollection(
          dbTPCollectionMock.id,
          wallet.address,
          fullCollection
        )
        expect(
          ThirdPartyService.syncVirtualThirdPartyContracts
        ).toHaveBeenCalledWith(
          dbTPCollectionMock.third_party_id,
          {
            network: dbTPCollectionMock.linked_contract_network,
            address: dbTPCollectionMock.linked_contract_address,
          },
          {
            network: dbTPCollectionMock.linked_contract_network,
            address: '0x77372a4cc66063575b05b44481f059be356964a4',
          }
        )
      })

      it('should not sync the virtual third party when the collection upsert fails', async () => {
        ;(Collection.upsertWithItemCount as jest.Mock).mockReset()
        ;(Collection.upsertWithItemCount as jest.Mock).mockRejectedValueOnce(
          new Error('duplicate key value violates unique constraint')
        )
        await expect(
          service.upsertTPCollection(
            dbTPCollectionMock.id,
            wallet.address,
            fullCollection
          )
        ).rejects.toThrow('duplicate key')
        expect(
          ThirdPartyService.syncVirtualThirdPartyContracts
        ).not.toHaveBeenCalled()
      })
    })

    describe('and the virtual third party sync fails', () => {
      beforeEach(() => {
        ;(ThirdPartyService.syncVirtualThirdPartyContracts as jest.Mock).mockRejectedValueOnce(
          new Error('db unavailable')
        )
      })

      it('should still resolve with the saved collection', () => {
        return expect(
          service.upsertTPCollection(
            dbTPCollectionMock.id,
            wallet.address,
            fullCollection
          )
        ).resolves.toEqual(dbTPCollectionMock)
      })
    })

    describe('and the linked contract stays the same', () => {
      it('should still sync the virtual third party, so an earlier failed sync is repaired', async () => {
        await service.upsertTPCollection(
          dbTPCollectionMock.id,
          wallet.address,
          fullCollection
        )
        const stored = {
          network: dbTPCollectionMock.linked_contract_network,
          address: dbTPCollectionMock.linked_contract_address,
        }
        expect(
          ThirdPartyService.syncVirtualThirdPartyContracts
        ).toHaveBeenCalledWith(dbTPCollectionMock.third_party_id, stored, {
          ...stored,
          address: stored.address!.toLowerCase(),
        })
      })
    })
  })

  describe('when upserting a collection and the third-party lookup fails transiently', () => {
    let fullCollection: FullCollection
    let ethAddress: string
    let lookupError: Error

    beforeEach(() => {
      ethAddress = wallet.address
      fullCollection = toFullCollection(dbTPCollectionMock)
      lookupError = new Error('third party graph unavailable')
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(undefined)
      ;(ThirdPartyService.getThirdParty as jest.Mock).mockRejectedValueOnce(
        lookupError
      )
    })

    it('should propagate the error and not create a virtual third party', async () => {
      await expect(
        service.upsertTPCollection(
          dbTPCollectionMock.id,
          ethAddress,
          fullCollection
        )
      ).rejects.toThrow('third party graph unavailable')
      expect(ThirdPartyService.createVirtualThirdParty).not.toHaveBeenCalled()
    })
  })
})
