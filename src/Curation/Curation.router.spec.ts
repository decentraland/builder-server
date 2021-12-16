import { ExpressApp } from '../common/ExpressApp'
import { isCommitteeMember } from '../Committee'
import { getMergedCollection } from '../Collection/utils'
import { collectionAPI } from '../ethereum/api/collection'
import { Collection } from '../Collection'
import {
  NonExistentCollectionError,
  UnpublishedCollectionError,
} from '../Collection/Collection.errors'
import { CurationRouter } from './Curation.router'
import { CollectionCuration } from './CollectionCuration'
import { ItemCuration } from './ItemCuration'
import { CurationService } from './Curation.service'
import { AuthRequest } from '../middleware'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')
jest.mock('../Committee')
jest.mock('../Collection/utils')

const mockIsComiteeMember = isCommitteeMember as jest.Mock
const mockGetMergedCollection = getMergedCollection as jest.Mock

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

      it('should resolve with the collections provided by Curation.getAllLatestByCollection', async () => {
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

      it('should resolve with the collections provided by Curation.getAllLatestForCollections', async () => {
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
        await expect(router.getCollectionCuration(req)).resolves.toStrictEqual(
          {}
        )
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

      describe('when updating a collection', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, false)
        })

        it('should reject with an unauthorized message', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).rejects.toThrowError('Unauthorized')
        })
      })

      describe('when updating an item', () => {
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

      describe('when updating a collection', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
        })

        it('should reject with invalid schema message', async () => {
          await expect(router.updateCollectionCuration(req)).rejects.toThrow(
            'Invalid schema'
          )
        })
      })

      describe('when updating an item', () => {
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
              status: 'rejected',
            },
          },
        } as any
      })

      describe('when updating a collection', () => {
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

      describe('when updating an item', () => {
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
              status: 'rejected',
            },
          },
        } as any
      })

      describe('when updating a collection', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)
        })

        it('should resolve with the updated curation', async () => {
          const updateSpy = jest
            .spyOn(CollectionCuration, 'update')
            .mockResolvedValueOnce({} as any)

          await expect(
            router.updateCollectionCuration(req)
          ).resolves.toStrictEqual({})

          expect(updateSpy).toHaveBeenCalledWith(
            {
              id: 'curationId',
              status: 'rejected',
              updated_at: expect.any(String),
            },
            { id: 'curationId' }
          )
        })
      })

      describe('when updating an item', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)
          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)
        })

        it('should resolve with the updated curation', async () => {
          const updateSpy = jest
            .spyOn(ItemCuration, 'update')
            .mockResolvedValueOnce({} as any)

          await expect(router.updateItemCuration(req)).resolves.toStrictEqual(
            {}
          )

          expect(updateSpy).toHaveBeenCalledWith(
            {
              id: 'curationId',
              status: 'rejected',
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

      describe('when updating a collection', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, false)
        })

        it('should reject with an unauthorized message', async () => {
          await expect(
            router.insertCollectionCuration(req)
          ).rejects.toThrowError('Unauthorized')
        })
      })

      describe('when updating an item', () => {
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

        mockGetMergedCollection.mockRejectedValueOnce(
          new NonExistentCollectionError('collectionId')
        )

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

        mockGetMergedCollection.mockRejectedValueOnce(
          new UnpublishedCollectionError('collectionId')
        )

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
        mockGetMergedCollection.mockResolvedValueOnce({})

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
      })

      describe('when updating a collection', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: 'pending' } as any)
        })

        it('should reject with an ongoing review message', async () => {
          await expect(
            router.insertCollectionCuration(req)
          ).rejects.toThrowError('There is already an ongoing review request')
        })
      })

      describe('when updating an item', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: 'pending' } as any)
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
        mockGetMergedCollection.mockResolvedValueOnce({})

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
      })

      describe('when updating a collection', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
        })

        it('should resolve with the inserted curation', async () => {
          const createSpy = jest
            .spyOn(CollectionCuration, 'create')
            .mockResolvedValueOnce({} as any)

          await expect(
            router.insertCollectionCuration(req)
          ).resolves.toStrictEqual({})

          expect(createSpy).toHaveBeenCalledWith({
            id: expect.any(String),
            collection_id: 'some id',
            status: 'pending',
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
          })
        })
      })

      describe('when updating an item', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
        })

        it('should resolve with the inserted curation', async () => {
          const createSpy = jest
            .spyOn(ItemCuration, 'create')
            .mockResolvedValueOnce({} as any)

          await expect(router.insertItemCuration(req)).resolves.toStrictEqual(
            {}
          )

          expect(createSpy).toHaveBeenCalledWith({
            id: expect.any(String),
            item_id: 'some id',
            status: 'pending',
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
          })
        })
      })
    })
  })
})
