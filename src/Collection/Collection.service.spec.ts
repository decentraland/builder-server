import { ThirdPartyFragment } from '../ethereum/api/fragments'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import {
  dbTPCollectionMock,
  thirdPartyFragmentMock,
} from '../../spec/mocks/collections'
import { wallet } from '../../spec/mocks/wallet'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'

jest.mock('../ethereum/api/thirdParty')
jest.mock('./Collection.model')

describe('Collection service', () => {
  let service: CollectionService

  beforeEach(() => {
    service = new CollectionService()
  })

  afterEach(() => {
    jest.restoreAllMocks()
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
    let thirdPartyFragments: ThirdPartyFragment[]

    beforeEach(() => {
      thirdPartyFragments = [
        thirdPartyFragmentMock,
        { ...thirdPartyFragmentMock, id: 'nonsense-id' },
      ]
      ;(Collection.findByThirdPartyIds as jest.Mock).mockReturnValueOnce([
        dbTPCollectionMock,
      ])
    })

    describe('when searching all collections', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.fetchThirdParties as jest.Mock).mockResolvedValueOnce(
          thirdPartyFragments
        )
      })

      it('should return the db third party collections for all managers', async () => {
        expect(await service.getDbTPCollections()).toEqual([dbTPCollectionMock])
      })

      it('should try to fetch db collections with all the ids', async () => {
        await service.getDbTPCollections()

        const ids = thirdPartyFragments.map((fragment) => fragment.id)
        expect(Collection.findByThirdPartyIds).toHaveBeenCalledWith(ids)
      })
    })

    describe('when searching by a specific manager', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.fetchThirdPartiesByManager as jest.Mock).mockResolvedValueOnce(
          thirdPartyFragments
        )
      })

      it('should return the db third party collections for the supplied manager', async () => {
        expect(
          await service.getDbTPCollectionsByManager(wallet.address)
        ).toEqual([dbTPCollectionMock])
      })

      it('should try to fetch db collections for the manager the ids', async () => {
        await service.getDbTPCollectionsByManager(wallet.address)

        const ids = thirdPartyFragments.map((fragment) => fragment.id)
        expect(Collection.findByThirdPartyIds).toHaveBeenCalledWith(ids)
      })
    })
  })
})
