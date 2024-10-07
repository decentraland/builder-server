import {
  dbTPCollectionMock,
  thirdPartyMock,
} from '../../spec/mocks/collections'
import { wallet } from '../../spec/mocks/wallet'
import { ThirdPartyService } from '../ThirdParty/ThirdParty.service'
import { ItemCuration } from '../Curation/ItemCuration'
import { ThirdParty } from '../ThirdParty/ThirdParty.types'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'
import { CollectionAttributes } from './Collection.types'

jest.mock('./Collection.model')
jest.mock('../ThirdParty/ThirdParty.service')
jest.mock('../Curation/ItemCuration/ItemCuration.model')

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
})
