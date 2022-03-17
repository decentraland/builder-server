import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { itemCurationMock } from '../../spec/mocks/itemCuration'
import { collectionAPI } from '../ethereum/api/collection'
import { ItemCuration } from '../Curation/ItemCuration'
import { decodeTPCollectionURN } from '../utils/urn'
import { UnpublishedCollectionError } from './Collection.errors'
import { CollectionAttributes } from './Collection.types'
import { Collection } from './Collection.model'
import { getMergedCollection } from './utils'

describe('when decoding the TP collection URN', () => {
  const collectionNetwork = 'ropsten'
  const thirdPartyId = `urn:decentraland:${collectionNetwork}:collections-thirdparty:a-third-party-id`
  const collectionURNSuffix = 'a-urn-suffix'
  let fullUrn: string

  describe('when the URN is not a valid TP URN', () => {
    beforeEach(() => {
      fullUrn = `an-invalid-urn`
    })

    it('should throw indicating that the URN is not TP compliant', () => {
      expect(() => decodeTPCollectionURN(fullUrn)).toThrow(
        'The given collection URN is not Third Party compliant'
      )
    })
  })

  describe('when the URN is a valid TP URN', () => {
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

    describe('when the remote collection can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)
        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce(null)
      })

      it('should throw an unpublished collection error', async () => {
        return expect(getMergedCollection(collection)).rejects.toEqual(
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

      it('should resolve with the merged collection', async () => {
        const result = await getMergedCollection(collection)

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

    describe('when the remote collection can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(ItemCuration, 'findLastByCollectionId')
          .mockResolvedValueOnce(undefined)
      })

      it('should throw an unpublished error', async () => {
        return expect(getMergedCollection(collection)).rejects.toEqual(
          new UnpublishedCollectionError(collection.id)
        )
      })
    })

    describe('when both the db and remote last item are obtained', () => {
      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(ItemCuration, 'findLastByCollectionId')
          .mockResolvedValueOnce(itemCurationMock)
      })

      it('should resolve with the merged collection', async () => {
        const result = await getMergedCollection(collection)

        expect(result).toStrictEqual({
          ...collection,
          reviewed_at: itemCurationMock.updated_at,
          created_at: itemCurationMock.created_at,
          updated_at: itemCurationMock.updated_at,
          is_published: true,
        })
      })
    })
  })
})
