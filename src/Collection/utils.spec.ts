import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { itemCurationMock } from '../../spec/mocks/itemCuration'
import { collectionAPI } from '../ethereum/api/collection'
import { ItemCuration } from '../Curation/ItemCuration'
import { decodeTPCollectionURN } from '../utils/urn'
import { Cheque } from '../SlotUsageCheque'
import { UnpublishedCollectionError } from './Collection.errors'
import { CollectionAttributes } from './Collection.types'
import { Collection } from './Collection.model'
import { getChequeMessageHash, getMergedCollection } from './utils'

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

describe('when getting the cheque hash', () => {
  let cheque: Cheque
  let thirdPartyId: string

  beforeEach(() => {
    thirdPartyId = 'urn:decentraland:mumbai:collections-thirdparty:jean-pier'
    cheque = {
      signature:
        '0x1dd053b34b48bc1e08be16c1d4f51908b4551040cf0fb390b90d18583dab2c7716ba3c73f00b5143e8ecdcd6227433226195e545a897df2e28849e91d291d9201c',
      qty: 1,
      salt:
        '0x79ab6dbeeebdd32191ad0b9774e07349b7883359f07237a6cb2179d7bf462a2f',
    }
  })

  it('should return the correct hash', () => {
    return expect(getChequeMessageHash(cheque, thirdPartyId)).resolves.toEqual(
      '0x808b380dc4bd97f8a0cf17c3548ad5c085964b31a99d5c52311c571b398783bc'
    )
  })
})
