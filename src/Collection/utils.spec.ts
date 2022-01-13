import { Collection, CollectionAttributes } from '.'
import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { thirdPartyItemFragmentMock } from '../../spec/mocks/items'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import {
  NonExistentCollectionError,
  UnpublishedCollectionError,
} from './Collection.errors'
import { getMergedCollection, decodeTPCollectionURN } from './utils'

describe('when decoding the TPW collection URN', () => {
  const collectionNetwork = 'ropsten'
  const thirdPartyId = `urn:decentraland:${collectionNetwork}:collections-thirdparty:a-third-party-id`
  const collectionURNSuffix = 'a-urn-suffix'
  let fullUrn: string

  describe('when the URN is not a valid TPW URN', () => {
    beforeEach(() => {
      fullUrn = `an-invalid-urn`
    })

    it('should throw indicating that the URN is not TPW compliant', () => {
      expect(() => decodeTPCollectionURN(fullUrn)).toThrow(
        'The given collection URN is not Third Party compliant'
      )
    })
  })

  describe('when the URN is a valid TPW URN', () => {
    beforeEach(() => {
      fullUrn = `${thirdPartyId}:${collectionURNSuffix}`
    })

    it('should match the network, the third party id and the collection id', () => {
      const { network, third_party_id, urn_suffix } = decodeTPCollectionURN(
        fullUrn
      )

      expect(network).toEqual(collectionNetwork)
      expect(third_party_id).toEqual(thirdPartyId)
      expect(urn_suffix).toEqual(collectionURNSuffix)
    })
  })
})

describe('getMergedCollection', () => {
  let collection: CollectionAttributes

  describe('when the collection is a dcl collection', () => {
    beforeEach(() => {
      collection = {
        ...dbCollectionMock,
      } as CollectionAttributes
    })

    describe('when the db collection can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(undefined)
      })

      it('should resolve with an undefined collection and a not found status', async () => {
        return expect(getMergedCollection(collection.id)).rejects.toEqual(
          new NonExistentCollectionError(collection.id)
        )
      })
    })

    describe('when the remote collection can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)
        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce(null)
      })

      it('should resolve with the db collection and an incomplete status', async () => {
        return expect(getMergedCollection(collection.id)).rejects.toEqual(
          new UnpublishedCollectionError(collection.id)
        )
      })
    })

    describe('when both the db and remote collection are obtained', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(collectionAPI, 'fetchCollection')
          .mockResolvedValueOnce(collectionFragmentMock)
      })

      it('should resolve with the merged collection and a complete status', async () => {
        const result = await getMergedCollection('collectionId')

        expect(result).toStrictEqual({
          ...collection,
          is_published: true,
          contract_address: collectionFragmentMock.id,
        })
      })
    })
  })

  describe('when the collection is a TP collection', () => {
    beforeEach(() => {
      collection = {
        ...dbTPCollectionMock,
      } as CollectionAttributes
    })

    describe('when the db collection can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(undefined)
      })

      it('should resolve with an undefined collection and a not found status', async () => {
        return expect(getMergedCollection(collection.id)).rejects.toEqual(
          new NonExistentCollectionError(collection.id)
        )
      })
    })

    describe('when the remote collection can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)
        jest
          .spyOn(thirdPartyAPI, 'fetchLastItem')
          .mockResolvedValueOnce(undefined)
      })

      it('should resolve with the db collection and an incomplete status', async () => {
        return expect(getMergedCollection(collection.id)).rejects.toEqual(
          new UnpublishedCollectionError(collection.id)
        )
      })
    })

    describe('when both the db and remote last item are obtained', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(thirdPartyAPI, 'fetchLastItem')
          .mockResolvedValueOnce(thirdPartyItemFragmentMock)
      })

      it('should resolve with the merged collection and a complete status', async () => {
        const result = await getMergedCollection('collectionId')

        expect(result).toStrictEqual({
          ...collection,
          is_published: true,
        })
      })
    })
  })
})
