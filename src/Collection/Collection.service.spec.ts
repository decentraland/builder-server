import { env } from 'decentraland-commons'
import {
  dbTPCollectionMock,
  thirdPartyFragmentMock,
} from '../../spec/mocks/collections'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'
import { ThirdPartyFragment } from '../ethereum/api/fragments'

jest.mock('../ethereum/api/thirdParty')
jest.mock('./Collection.model')

describe('Collection service', () => {
  let service: CollectionService

  beforeEach(() => {
    service = new CollectionService()
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

  describe('when checking if an address is a TPW manager', () => {
    afterAll(() => {
      jest.restoreAllMocks()
    })

    describe('when an address belongs to the TPW_MANAGER_ADDRESSES env var', () => {
      let manager: string
      beforeEach(() => {
        manager = '0x123123'
        jest
          .spyOn(env, 'get')
          .mockReturnValueOnce(`0x555,${manager},0x444,0x333`)
      })

      it('should return true', async () => {
        expect(await service.isTPWManager('', manager)).toBe(true)
        expect(env.get).toHaveBeenCalledWith('TPW_MANAGER_ADDRESSES', '')
      })
    })

    describe('when an address does not belong to the TPW_MANAGER_ADDRESSES env var', () => {
      let urn: string
      let manager: string

      beforeEach(() => {
        urn = 'some:valid:urn'
        manager = '0x123123'
        jest.spyOn(env, 'get').mockReturnValueOnce(`0x555,0x444,0x333`)
      })

      describe('when thegraph has a urn with the address as manager', () => {
        beforeEach(() => {
          ;(thirdPartyAPI.isManager as jest.Mock).mockReturnValueOnce(true)
        })

        it('should return true', async () => {
          expect(await service.isTPWManager(urn, manager)).toBe(true)
          expect(thirdPartyAPI.isManager).toHaveBeenCalledWith(urn, manager)
          expect(env.get).toHaveBeenCalledWith('TPW_MANAGER_ADDRESSES', '')
        })
      })

      describe('when thegraph does not has a urn with the address as manager', () => {
        beforeEach(() => {
          ;(thirdPartyAPI.isManager as jest.Mock).mockReturnValueOnce(false)
        })

        it('should return true', async () => {
          expect(await service.isTPWManager(urn, manager)).toBe(false)
          expect(thirdPartyAPI.isManager).toHaveBeenCalledWith(urn, manager)
          expect(env.get).toHaveBeenCalledWith('TPW_MANAGER_ADDRESSES', '')
        })
      })
    })
  })

  describe('when getting the database TPW collections', () => {
    describe('when no third party is supplied', () => {
      it('should return an empty array', async () => {
        expect(await service.getDbTPCollections([])).toEqual([])
      })
    })

    describe('when third party records are supplied', () => {
      let thirdPartyFragments: ThirdPartyFragment[]

      beforeEach(() => {
        ;(Collection.findByThirdPartyIds as jest.Mock).mockReturnValueOnce([
          dbTPCollectionMock,
        ])
        thirdPartyFragments = [
          thirdPartyFragmentMock,
          { ...thirdPartyFragmentMock, id: 'nonsense-id' },
        ]
      })

      it('should return the db third party collections with the record ids', async () => {
        expect(await service.getDbTPCollections(thirdPartyFragments)).toEqual([
          dbTPCollectionMock,
        ])
      })

      it('should try to fetch db collections with all the ids', () => {
        const ids = thirdPartyFragments.map((fragment) => fragment.id)
        expect(Collection.findByThirdPartyIds).toHaveBeenCalledWith(ids)
      })
    })
  })
})
