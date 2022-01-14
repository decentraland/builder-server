import { ExpressApp } from '../common/ExpressApp'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { dbItemMock, thirdPartyItemFragmentMock } from '../../spec/mocks/items'
import { Collection, CollectionAttributes } from '../Collection'
import { Item, ItemAttributes } from '../Item'
import { isCommitteeMember } from '../Committee'
import { AuthRequest } from '../middleware'
import { CurationRouter } from './Curation.router'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import { ItemCuration, ItemCurationAttributes } from './ItemCuration'
import { CurationService } from './Curation.service'
import { CurationStatus } from './Curation.types'
import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { toUnixTimestamp } from '../utils/parse'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')
jest.mock('../Committee')

const mockIsComiteeMember = isCommitteeMember as jest.Mock

describe('when handling a request', () => {
  let router: CurationRouter

  function mockServiceWithAccess(
    CurationModel: typeof CollectionCuration | typeof ItemCuration,
    hasAccess: boolean
  ) {
    const service = mockService(CurationModel)
    jest.spyOn(service, 'hasAccess').mockResolvedValueOnce(hasAccess)
    return service
  }

  function mockService(
    CurationModel: typeof CollectionCuration | typeof ItemCuration
  ) {
    const service = new CurationService(CurationModel)
    jest.spyOn(CurationService, 'byType').mockReturnValueOnce(service)
    return service
  }

  beforeEach(() => {
    router = new CurationRouter(new ExpressApp())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when trying to obtain a list of collection curations', () => {
    let service: CurationService<any>

    describe('when the caller belongs to the commitee', () => {
      beforeEach(() => {
        service = mockService(CollectionCuration)
        mockIsComiteeMember.mockResolvedValueOnce(true)
      })

      it('should resolve with the collections provided by Curation.getLatest', async () => {
        const getAllLatestSpy = jest
          .spyOn(service, 'getLatest')
          .mockResolvedValueOnce([])

        const req = {
          auth: { ethAddress: 'ethAddress' },
        } as any

        await router.getCollectionCurations(req)

        expect(getAllLatestSpy).toHaveBeenCalled()
      })
    })

    describe('when the caller does not belong to the commitee', () => {
      beforeEach(() => {
        service = mockService(CollectionCuration)
        mockIsComiteeMember.mockResolvedValueOnce(false)
      })

      it('should resolve with the collections provided by Curation.getLatestByIds', async () => {
        const fetchCollectionsByAuthorizedUserSpy = jest
          .spyOn(collectionAPI, 'fetchCollectionsByAuthorizedUser')
          .mockResolvedValueOnce([
            { id: 'contractAddress1' },
            { id: 'contractAddress2' },
          ] as any)

        const findByContractAddressesSpy = jest
          .spyOn(Collection, 'findByContractAddresses')
          .mockResolvedValueOnce([
            { id: 'collectionId1' },
            { id: 'collectionId2' },
          ] as any)

        const getAllLatestForCollectionsSpy = jest
          .spyOn(service, 'getLatestByIds')
          .mockResolvedValueOnce([])

        const req = {
          auth: { ethAddress: 'ethAddress' },
        } as any

        await router.getCollectionCurations(req)

        expect(fetchCollectionsByAuthorizedUserSpy).toHaveBeenCalledWith(
          'ethAddress'
        )

        expect(findByContractAddressesSpy).toHaveBeenCalledWith([
          'contractAddress1',
          'contractAddress2',
        ])

        expect(getAllLatestForCollectionsSpy).toHaveBeenCalledWith([
          'collectionId1',
          'collectionId2',
        ])
      })
    })
  })

  describe('when trying to obtain the latest curation for a collection', () => {
    let service: CurationService<any>
    let req: AuthRequest

    beforeEach(() => {
      req = {
        auth: { ethAddress: 'ethAddress' },
        params: { id: 'collectionId' },
      } as any
    })

    describe('when the caller has no access', () => {
      beforeEach(() => {
        service = mockServiceWithAccess(CollectionCuration, false)
      })

      it('should reject with an unauthorized message', async () => {
        await expect(router.getCollectionCuration(req)).rejects.toThrowError(
          'Unauthorized'
        )
      })
    })

    describe('when everything is correct', () => {
      beforeEach(() => {
        service = mockServiceWithAccess(CollectionCuration, true)
        jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({})
      })

      it('should resolve with the expected curation', async () => {
        expect(await router.getCollectionCuration(req)).toEqual({})
      })
    })
  })

  describe('when trying to get the item stats for a collection curation', () => {
    let req: AuthRequest
    let collection: CollectionAttributes

    describe('when the caller has no access to the collection', () => {
      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any

        mockServiceWithAccess(CollectionCuration, false)
      })

      it('should reject with an unauthorized message', async () => {
        await expect(
          router.getCollectionCurationItemStats(req)
        ).rejects.toThrowError('Unauthorized')
      })
    })

    describe('when the collection is not a TP collection', () => {
      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
        collection = { ...dbCollectionMock }

        mockServiceWithAccess(CollectionCuration, true)

        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)
      })

      it('should reject with an bad request', async () => {
        await expect(
          router.getCollectionCurationItemStats(req)
        ).rejects.toThrowError('Collection is not a third party collection')
      })
    })

    describe('when there are no remote published items', () => {
      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
        collection = { ...dbTPCollectionMock }

        mockServiceWithAccess(CollectionCuration, true)

        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)
        jest
          .spyOn(thirdPartyAPI, 'fetchItemsByCollection')
          .mockResolvedValueOnce([])
      })

      it('should return 0 for all stats', async () => {
        await expect(
          router.getCollectionCurationItemStats(req)
        ).resolves.toStrictEqual({
          total: 0,
          approved: 0,
          rejected: 0,
          needsReview: 0,
        })
      })
    })

    describe('when there are remote published items', () => {
      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
        collection = { ...dbTPCollectionMock }

        mockServiceWithAccess(CollectionCuration, true)

        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)
        jest
          .spyOn(thirdPartyAPI, 'fetchItemsByCollection')
          .mockResolvedValueOnce([
            // Approved
            { ...thirdPartyItemFragmentMock, isApproved: true },
            { ...thirdPartyItemFragmentMock, isApproved: true },
            // Rejected
            {
              ...thirdPartyItemFragmentMock,
              isApproved: false,
              reviewedAt: toUnixTimestamp(Date.now()),
            },
            // Needs review
            { ...thirdPartyItemFragmentMock, isApproved: false },
            { ...thirdPartyItemFragmentMock, isApproved: false },
          ])
      })

      it('should count them for each related total', async () => {
        await expect(
          router.getCollectionCurationItemStats(req)
        ).resolves.toStrictEqual({
          total: 5,
          approved: 2,
          rejected: 1,
          needsReview: 2,
        })
      })
    })
  })

  describe('when trying to update a curation', () => {
    let service: CurationService<any>

    describe('when the caller has no access to the collection', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: {} },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, false)
        })

        it('should reject with an unauthorized message', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).rejects.toThrowError('Unauthorized')
        })
      })

      describe('when updating an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, false)
        })

        it('should reject with an unauthorized message', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrowError(
            'Unauthorized'
          )
        })
      })
    })

    describe('when the payload is invalid', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: { nonsense: 2 } },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
        })

        it('should reject with invalid schema message', async () => {
          await expect(router.updateCollectionCuration(req)).rejects.toThrow(
            'Invalid schema'
          )
        })
      })

      describe('when updating an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)
        })

        it('should reject with invalid schema message', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrow(
            'Invalid schema'
          )
        })
      })
    })

    describe('when the curation does not exist', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
            },
          },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
        })

        it('should reject with curation not found message', async () => {
          await expect(router.updateCollectionCuration(req)).rejects.toThrow(
            'Curation does not exist'
          )
        })
      })

      describe('when updating an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
        })

        it('should reject with curation not found message', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrow(
            'Curation does not exist'
          )
        })
      })
    })

    describe('when everything is fine', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
            },
          },
        } as any
      })

      describe('when updating a collection curation', () => {
        let updateSpy: jest.SpyInstance<Promise<ItemAttributes>>
        let expectedCuration: CollectionCurationAttributes

        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          expectedCuration = {
            id: 'uuid-123123-123123',
          } as CollectionCurationAttributes

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)

          updateSpy = jest
            .spyOn(CollectionCuration, 'update')
            .mockResolvedValueOnce(expectedCuration)
        })

        it('should resolve with the updated curation', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).resolves.toStrictEqual(expectedCuration)
        })

        it('should call the update method with the right data', async () => {
          await router.updateCollectionCuration(req)

          expect(updateSpy).toHaveBeenCalledWith(
            {
              id: 'curationId',
              status: CurationStatus.REJECTED,
              updated_at: expect.any(String),
            },
            { id: 'curationId' }
          )
        })
      })

      describe('when updating an item curation', () => {
        let updateSpy: jest.SpyInstance<Promise<ItemAttributes>>
        let expectedCuration: ItemCurationAttributes

        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)
          expectedCuration = {
            id: 'uuid-123123-123123',
          } as ItemCurationAttributes

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)

          updateSpy = jest
            .spyOn(ItemCuration, 'update')
            .mockResolvedValueOnce(expectedCuration)
        })

        it('should resolve with the updated curation', async () => {
          await expect(router.updateItemCuration(req)).resolves.toStrictEqual(
            expectedCuration
          )
        })

        it('should call the update method with the right data', async () => {
          await router.updateItemCuration(req)

          expect(updateSpy).toHaveBeenCalledWith(
            {
              id: 'curationId',
              status: CurationStatus.REJECTED,
              updated_at: expect.any(String),
            },
            { id: 'curationId' }
          )
        })
      })
    })
  })

  describe('when trying to insert a new curation', () => {
    let service: CurationService<any>

    describe('when the caller has no access', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
      })

      describe('when inserting a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, false)

          jest
            .spyOn(Collection, 'findOne')
            .mockResolvedValueOnce({ ...dbCollectionMock })
          jest
            .spyOn(collectionAPI, 'fetchCollection')
            .mockResolvedValueOnce({ ...collectionFragmentMock })
        })

        it('should reject with an unauthorized message', async () => {
          await expect(
            router.insertCollectionCuration(req)
          ).rejects.toThrowError('Unauthorized')
        })
      })

      describe('when inserting an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, false)
        })

        it('should reject with an unauthorized message', async () => {
          await expect(router.insertItemCuration(req)).rejects.toThrowError(
            'Unauthorized'
          )
        })
      })
    })

    describe('when the collection does not exist', () => {
      let req: AuthRequest

      beforeEach(() => {
        service = mockServiceWithAccess(CollectionCuration, true)

        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(undefined)

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'collectionId' },
        } as any
      })

      it('should reject with a not found message', async () => {
        await expect(router.insertCollectionCuration(req)).rejects.toThrowError(
          'Collection does not exist'
        )
      })
    })

    describe('when the collection is not published', () => {
      let req: AuthRequest

      beforeEach(() => {
        service = mockServiceWithAccess(CollectionCuration, true)

        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce({ ...dbCollectionMock })
        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce(null)

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'collectionId' },
        } as any
      })

      it('should reject with collection not published message', async () => {
        await expect(router.insertCollectionCuration(req)).rejects.toThrowError(
          'Collection is not published'
        )
      })
    })

    describe('when the resource has a pending review', () => {
      let req: AuthRequest

      beforeEach(() => {
        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce({ ...dbCollectionMock })
        jest
          .spyOn(collectionAPI, 'fetchCollection')
          .mockResolvedValueOnce({ ...collectionFragmentMock })

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: CurationStatus.PENDING } as any)
        })

        it('should reject with an ongoing review message', async () => {
          await expect(
            router.insertCollectionCuration(req)
          ).rejects.toThrowError('There is already an ongoing review request')
        })
      })

      describe('when updating an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: CurationStatus.PENDING } as any)
        })

        it('should reject with an ongoing review message', async () => {
          await expect(router.insertItemCuration(req)).rejects.toThrowError(
            'There is already an ongoing review request'
          )
        })
      })
    })

    describe('when everything is fine', () => {
      let req: AuthRequest

      beforeEach(() => {
        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce({ ...dbCollectionMock })
        jest
          .spyOn(collectionAPI, 'fetchCollection')
          .mockResolvedValueOnce({ ...collectionFragmentMock })

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
        })

        it('should resolve with the inserted curation', async () => {
          const createSpy = jest
            .spyOn(CollectionCuration, 'create')
            .mockResolvedValueOnce({} as any)

          expect(await router.insertCollectionCuration(req)).toEqual({})

          expect(createSpy).toHaveBeenCalledWith({
            id: expect.any(String),
            collection_id: 'some id',
            status: CurationStatus.PENDING,
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
          })
        })
      })

      describe('when updating an item', () => {
        let item: ItemAttributes
        let createItemCurationSpy: jest.SpyInstance
        let createCollectionCurationSpy: jest.SpyInstance
        let findSpy: jest.SpyInstance
        let collectionService: CurationService<any>

        beforeEach(() => {
          item = { ...dbItemMock }
          service = mockServiceWithAccess(ItemCuration, true)
          collectionService = mockServiceWithAccess(CollectionCuration, true)

          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
          jest
            .spyOn(collectionService, 'getLatestById')
            .mockResolvedValueOnce(undefined)

          jest.spyOn(Item, 'findOne').mockResolvedValueOnce(item)

          createItemCurationSpy = jest
            .spyOn(ItemCuration, 'create')
            .mockResolvedValueOnce({} as any)
        })

        describe('when the item collection already has a (virtual) curation', () => {
          let collectionCuration: CollectionCurationAttributes

          beforeEach(() => {
            collectionCuration = { id: 'my id' } as CollectionCurationAttributes

            findSpy = jest
              .spyOn(CollectionCuration, 'findByItemId')
              .mockResolvedValueOnce(collectionCuration)
          })

          it('should resolve with the inserted curation', async () => {
            expect(await router.insertItemCuration(req)).toEqual({})

            expect(createItemCurationSpy).toHaveBeenCalledWith({
              id: expect.any(String),
              item_id: 'some id',
              status: CurationStatus.PENDING,
              created_at: expect.any(Date),
              updated_at: expect.any(Date),
            })
          })

          it('should call the collection curation to check if it exists', async () => {
            await router.insertItemCuration(req)
            expect(findSpy).toHaveBeenCalledWith(req.params.id)
          })
        })

        describe('when the item collection does not have a virtual curation', () => {
          beforeEach(() => {
            createCollectionCurationSpy = jest
              .spyOn(CollectionCuration, 'create')
              .mockResolvedValueOnce({} as any)

            jest
              .spyOn(CollectionCuration, 'findByItemId')
              .mockResolvedValueOnce(undefined)
          })

          it('should create the virtual collection', async () => {
            await router.insertItemCuration(req)

            expect(createCollectionCurationSpy).toHaveBeenCalledWith({
              id: expect.any(String),
              collection_id: item.collection_id,
              status: CurationStatus.PENDING,
              created_at: expect.any(Date),
              updated_at: expect.any(Date),
            })
          })
        })
      })
    })
  })
})
