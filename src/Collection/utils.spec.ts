import { Collection } from '.'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
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
  let sampleCollection: { id: string }

  beforeEach(() => {
    sampleCollection = {
      id: 'collectionId',
    }
  })

  describe('when the db collection can not be found', () => {
    it('should resolve with an undefined collection and a not found status', async () => {
      jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(undefined)
      return expect(getMergedCollection(sampleCollection.id)).rejects.toEqual(
        new NonExistentCollectionError(sampleCollection.id)
      )
    })
  })

  describe('when the remote collection can not be found', () => {
    it('should resolve with the db collection and an incomplete status', async () => {
      jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(sampleCollection)
      jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce(null)
      return expect(getMergedCollection(sampleCollection.id)).rejects.toEqual(
        new UnpublishedCollectionError(sampleCollection.id)
      )
    })
  })

  describe('when both the db and remote collection are obtained', () => {
    it('should resolve with the merged collection and a complete status', async () => {
      jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(sampleCollection)

      jest
        .spyOn(collectionAPI, 'fetchCollection')
        .mockResolvedValueOnce(sampleCollection as any)

      jest
        .spyOn(Bridge, 'mergeCollection')
        .mockReturnValueOnce(sampleCollection as any)

      const collection = await getMergedCollection('collectionId')
      expect(collection).toStrictEqual(sampleCollection)
    })
  })
})
