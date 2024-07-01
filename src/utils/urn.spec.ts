import { decodeThirdPartyItemURN } from './urn'

describe('when decoding the an item URN', () => {
  let urn: string

  describe('when the URN is not a valid item URN', () => {
    beforeEach(() => {
      urn = `an-invalid-urn`
    })

    it('should throw indicating that the URN is not item compliant', () => {
      expect(() => decodeThirdPartyItemURN(urn)).toThrow(
        'The given item URN is not item compliant'
      )
    })
  })

  describe('when the URN is not a valid Third Party item URN', () => {
    beforeEach(() => {
      urn = `urn:decentraland:matic:collections-v2:0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C:1`
    })

    it('should throw indicating that the URN is not Third Party compliant', () => {
      expect(() => decodeThirdPartyItemURN(urn)).toThrow(
        'The given item URN is not Third Party compliant'
      )
    })
  })

  describe('when the URN is a valid Third Party v1 item URN', () => {
    let thirdPartyId: string
    let collectionId: string
    let tokenId: string
    let network: string

    beforeEach(() => {
      thirdPartyId = 'crypto-motors'
      collectionId = 'some-name'
      tokenId = '1'
      network = 'matic'
      urn = `urn:decentraland:${network}:collections-thirdparty:${thirdPartyId}:${collectionId}:${tokenId}`
    })

    it('should match the third party name, the network, the collection id and the item id', () => {
      const {
        third_party_id,
        network: thirdPartyNetwork,
        collection_urn_suffix,
        item_urn_suffix,
      } = decodeThirdPartyItemURN(urn)

      expect(
        `urn:decentraland:matic:collections-thirdparty:${thirdPartyId}`
      ).toEqual(third_party_id)
      expect(thirdPartyNetwork).toEqual(network)
      expect(collection_urn_suffix).toEqual(collectionId)
      expect(item_urn_suffix).toEqual(tokenId)
    })
  })

  describe('when the URN is a valid Third Party v2 item URN', () => {
    let thirdPartyId: string
    let collectionId: string
    let tokenId: string
    let network: string

    beforeEach(() => {
      thirdPartyId = 'crypto-motors'
      collectionId = 'mainnet:0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C'
      tokenId = '1'
      network = 'matic'
      urn = `urn:decentraland:${network}:collections-linked-wearables:${thirdPartyId}:${collectionId}:${tokenId}`
    })

    it('should match the third party name, the network, the linked collection network, the linked collection address, the collection id and the item id', () => {
      const {
        third_party_id,
        network,
        collection_urn_suffix,
        item_urn_suffix,
      } = decodeThirdPartyItemURN(urn)

      expect(
        `urn:decentraland:matic:collections-linked-wearables:${thirdPartyId}`
      ).toEqual(third_party_id)
      expect(network).toEqual(network)
      expect(collection_urn_suffix).toEqual(collectionId)
      expect(item_urn_suffix).toEqual(tokenId)
    })
  })
})
