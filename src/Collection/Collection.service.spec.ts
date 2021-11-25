import { env } from 'decentraland-commons'
import { collectionAttributesMock } from '../../spec/mocks/collections'
import { wallet } from '../../spec/mocks/wallet'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Collection } from './Collection.model'
import { CollectionAttributes } from './Collection.types'
import { CollectionService } from './Collection.service'

jest.mock('../ethereum/api/thirdParty')
jest.mock('./Collection.model')

describe('Collection service', () => {
  describe('when checking if the lock is active', () => {
    const service = new CollectionService()

    const twoDaysInMilliseconds = 2 * 24 * 60 * 60 * 1000
    const thrityMinutesInMilliseconds = 30 * 60 * 1000

    describe('when the collection does not have a lock set', () => {
      it('should return false', async () => {
        expect(await service.isLockActive(null)).toBe(false)
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

      it('should return false', async () => {
        expect(await service.isLockActive(lock)).toBe(false)
      })
    })

    describe('when the collection is locked with a date sooner than a day', () => {
      let lock: Date

      beforeEach(() => {
        lock = new Date(Date.now() + thrityMinutesInMilliseconds)
      })

      it('should return true', async () => {
        expect(await service.isLockActive(lock)).toBe(true)
      })
    })
  })

  describe('when checking if an address is a TPW manager', () => {
    const service = new CollectionService()
    let urn: string
    let manager: string

    beforeEach(() => {
      urn = 'some:valid:urn'
      manager = '0x123123'
      jest.spyOn(env, 'get').mockReturnValueOnce(`0x555,0x444,0x333`)
    })

    afterAll(() => {
      jest.restoreAllMocks()
    })

    describe('when thegraph has a urn with the address as manager', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.isManager as jest.Mock).mockReturnValueOnce(true)
      })

      it('should return true', async () => {
        expect(await service.isTPWManager(urn, manager)).toBe(true)
        expect(thirdPartyAPI.isManager).toHaveBeenCalledWith(urn, manager)
      })
    })

    describe('when thegraph does not has a urn with the address as manager', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.isManager as jest.Mock).mockReturnValueOnce(false)
      })

      it('should return true', async () => {
        expect(await service.isTPWManager(urn, manager)).toBe(false)
        expect(thirdPartyAPI.isManager).toHaveBeenCalledWith(urn, manager)
      })
    })
  })

  describe('when getting the database TPW collections', () => {
    describe('when the graph has no third party records', () => {
      let service: CollectionService
      beforeEach(() => {
        service = new CollectionService()
        ;(thirdPartyAPI.fetchThirdPartyIds as jest.Mock).mockReturnValueOnce([])
      })

      it('should return an empty array', async () => {
        expect(await service.getDbTPWCollections(wallet.address)).toEqual([])
      })
    })

    describe('when the graph has third party records', () => {
      let service: CollectionService
      let thirdPartyDbCollection: CollectionAttributes

      beforeEach(() => {
        service = new CollectionService()
        thirdPartyDbCollection = {
          ...collectionAttributesMock,
          urn_suffix: 'thesuffix',
          third_party_id: 'some:third-party-id',
        }
        ;(thirdPartyAPI.fetchThirdPartyIds as jest.Mock).mockReturnValueOnce([
          thirdPartyDbCollection.id,
        ])
        ;(Collection.findByThirdPartyIds as jest.Mock).mockReturnValueOnce([
          thirdPartyDbCollection,
        ])
      })

      it('should return the db collections of the third party collections with managed by the given address', async () => {
        expect(await service.getDbTPWCollections(wallet.address)).toEqual([
          {
            ...thirdPartyDbCollection,
            eth_address: wallet.address,
          },
        ])
        expect(Collection.findByThirdPartyIds).toHaveBeenCalledWith([
          thirdPartyDbCollection.id,
        ])
      })
    })
  })
})
