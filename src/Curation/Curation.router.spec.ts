import { Curation, CurationRouter } from '.'
import { ExpressApp } from '../common/ExpressApp'
import { isCommitteeMember } from '../Committee'
import { hasAccessToCollection } from './access'
import { getMergedCollection } from '../Collection/util'
import { collectionAPI } from '../ethereum/api/collection'
import { Collection } from '../Collection'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')
jest.mock('../Committee')
jest.mock('../Collection/util')
jest.mock('./access')

const mockIsComiteeMember = isCommitteeMember as jest.Mock
const mockHasAccessToCollection = hasAccessToCollection as jest.Mock
const mockGetMergedCollection = getMergedCollection as jest.Mock

describe('when handling a request', () => {
  let router: CurationRouter

  beforeEach(() => {
    router = new CurationRouter(new ExpressApp())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when trying to obtain a list of curations', () => {
    describe('when the caller belongs to the commitee', () => {
      it('should resolve with the collections provided by Curation.getAllLatestByCollection', async () => {
        mockIsComiteeMember.mockResolvedValueOnce(true)

        const getAllLatestByCollectionSpy = jest
          .spyOn(Curation, 'getAllLatestByCollection')
          .mockResolvedValueOnce([])

        const req = {
          auth: { ethAddress: 'ethAddress' },
        } as any

        await router.getCurations(req)

        expect(getAllLatestByCollectionSpy).toHaveBeenCalled()
      })
    })

    describe('when the caller does not belong to the commitee', () => {
      it('should resolve with the collections provided by Curation.getAllLatestForCollections', async () => {
        mockIsComiteeMember.mockResolvedValueOnce(false)

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
          .spyOn(Curation, 'getAllLatestForCollections')
          .mockResolvedValueOnce([])

        const req = {
          auth: { ethAddress: 'ethAddress' },
        } as any

        await router.getCurations(req)

        expect(fetchCollectionsByAuthorizedUserSpy).toHaveBeenCalledWith("ethAddress")

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
    describe('when the caller has no access', () => {
      it('should reject with an unauthorized message', async () => {
        mockHasAccessToCollection.mockResolvedValueOnce(false)

        const req = {
          auth: { ethAddress: 'ethAddress' },
          params: { collectionId: 'collectionId' },
        } as any

        await expect(router.getCuration(req)).rejects.toThrowError(
          'Unauthorized'
        )
      })
    })

    describe('when everything is correct', () => {
      it('should resolve with the expected curation', async () => {
        mockHasAccessToCollection.mockResolvedValueOnce(true)
        jest
          .spyOn(Curation, 'getLatestForCollection')
          .mockResolvedValueOnce({} as any)

        const req = {
          auth: { ethAddress: 'ethAddress' },
          params: { collectionId: 'collectionId' },
        } as any

        await expect(router.getCuration(req)).resolves.toStrictEqual({})
      })
    })
  })

  describe('when trying to insert a new curation', () => {
    describe('when the caller has no access', () => {
      it('should reject with an unauthorized message', async () => {
        mockHasAccessToCollection.mockResolvedValueOnce(false)

        const req = {
          auth: { ethAddress: 'ethAddress' },
          params: { collectionId: 'collectionId' },
        } as any

        await expect(router.insertCuration(req)).rejects.toThrowError(
          'Unauthorized'
        )
      })
    })

    describe('when the collection does not exist', () => {
      it('should reject with collection not found message', async () => {
        mockHasAccessToCollection.mockResolvedValueOnce(true)
        mockGetMergedCollection.mockResolvedValueOnce({ collection: undefined })

        const req = {
          auth: { ethAddress: 'ethAddress' },
          params: { collectionId: 'collectionId' },
        } as any

        await expect(router.insertCuration(req)).rejects.toThrowError(
          'Collection does not exist'
        )
      })
    })

    describe('when the collection has a pending review', () => {
      it('should reject with an ongoing review message', async () => {
        mockHasAccessToCollection.mockResolvedValueOnce(true)

        mockGetMergedCollection.mockResolvedValueOnce({
          collection: { reviewed_at: new Date(2000, 0) },
        })

        jest
          .spyOn(Curation, 'getLatestForCollection')
          .mockResolvedValueOnce({ timestamp: new Date(2000, 1) } as any)

        const req = {
          auth: { ethAddress: 'ethAddress' },
          params: { collectionId: 'collectionId' },
        } as any

        await expect(router.insertCuration(req)).rejects.toThrowError(
          'There is already an ongoing review request for this collection'
        )
      })
    })

    describe('when everything is fine', () => {
      it('should resolve with an upserted curation', async () => {
        mockHasAccessToCollection.mockResolvedValueOnce(true)

        mockGetMergedCollection.mockResolvedValueOnce({
          collection: { reviewed_at: new Date(2000, 1) },
        })

        jest
          .spyOn(Curation, 'getLatestForCollection')
          .mockResolvedValueOnce({ timestamp: new Date(2000, 0) } as any)

        jest.spyOn(Curation, 'upsert').mockResolvedValueOnce({} as any)

        const req = {
          auth: { ethAddress: 'ethAddress' },
          params: { collectionId: 'collectionId' },
        } as any

        await expect(router.insertCuration(req)).resolves.toStrictEqual({})
      })
    })
  })
})
