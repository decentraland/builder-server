import { matchers } from './matchers'

describe('when using the collection URN matcher', () => {
  let decentralandURN: string

  describe('and the urn to be checked is from a decentraland collection', () => {
    let collectionAddress: string

    beforeEach(() => {
      collectionAddress = '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd8'
      decentralandURN = `urn:decentraland:mumbai:collections-v2:${collectionAddress}`
    })

    it('should match the URN', () => {
      expect(new RegExp(matchers.collectionUrn).test(decentralandURN)).toBe(
        true
      )
    })

    it('should extract the network, the type and the collection address', () => {
      const matches = new RegExp(matchers.collectionUrn).exec(decentralandURN)

      expect(matches).not.toBeNull()
      expect(matches?.groups?.protocol).toBe('mumbai')
      expect(matches?.groups?.type).toBe('collections-v2')
      expect(matches?.groups?.collectionAddress).toBe(collectionAddress)
    })
  })

  describe('and the urn to be checked is from a third party v1 collection', () => {
    let decentralandURN: string
    let thirdPartyName: string
    let collection_id: string

    beforeEach(() => {
      thirdPartyName = 'crypto-motors'
      collection_id = 'some-name'
      decentralandURN = `urn:decentraland:matic:collections-thirdparty:${thirdPartyName}:${collection_id}`
    })

    it('should match the URN', () => {
      expect(new RegExp(matchers.collectionUrn).test(decentralandURN)).toBe(
        true
      )
    })

    it('should extract the network, the type, the third party name and the collection id', () => {
      const matches = new RegExp(matchers.collectionUrn).exec(decentralandURN)

      expect(matches).not.toBeNull()
      expect(matches?.groups?.protocol).toBe('matic')
      expect(matches?.groups?.type).toBe('collections-thirdparty')
      expect(matches?.groups?.thirdPartyName).toBe(thirdPartyName)
      expect(matches?.groups?.thirdPartyCollectionId).toBe(collection_id)
    })
  })

  describe('and the urn to be checked is from a third party v2 collection', () => {
    let decentralandURN: string
    let thirdPartyName: string
    let linkedCollectionNetwork: string
    let linkedCollectionAddress: string

    beforeEach(() => {
      thirdPartyName = 'crypto-motors'
      linkedCollectionNetwork = 'mainnet'
      linkedCollectionAddress = '0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C'
      decentralandURN = `urn:decentraland:matic:collections-linked-wearables:${thirdPartyName}:${linkedCollectionNetwork}:${linkedCollectionAddress}`
    })

    it('should match the URN', () => {
      expect(new RegExp(matchers.collectionUrn).test(decentralandURN)).toBe(
        true
      )
    })

    it('should extract the network, the type, the third party name, the linked collection network and the linked collection address', () => {
      const matches = new RegExp(matchers.collectionUrn).exec(decentralandURN)

      expect(matches).not.toBeNull()
      expect(matches?.groups?.protocol).toBe('matic')
      expect(matches?.groups?.type).toBe('collections-linked-wearables')
      expect(matches?.groups?.thirdPartyLinkedCollectionName).toBe(
        thirdPartyName
      )
      expect(matches?.groups?.linkedCollectionNetwork).toBe(
        linkedCollectionNetwork
      )
      expect(matches?.groups?.linkedCollectionContractAddress).toBe(
        linkedCollectionAddress
      )
    })
  })

  describe('and the urn to be checked is invalid', () => {
    let decentralandURN: string

    beforeEach(() => {
      decentralandURN = 'an-invalid-urn'
    })

    it('should not match the URN', () => {
      expect(new RegExp(matchers.collectionUrn).test(decentralandURN)).toBe(
        false
      )
    })
  })
})

describe('when using the item URN matcher', () => {
  let decentralandURN: string

  describe('and the urn to be checked is from a decentraland item', () => {
    let contractAddress: string
    let tokenId: string

    beforeEach(() => {
      contractAddress = '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd8'
      tokenId = '1'
      decentralandURN = `urn:decentraland:mumbai:collections-v2:${contractAddress}:${tokenId}`
    })

    it('should match the URN', () => {
      expect(new RegExp(matchers.itemUrn).test(decentralandURN)).toBe(true)
    })

    it('should extract the network, the type, the collection address and the item id', () => {
      const matches = new RegExp(matchers.itemUrn).exec(decentralandURN)

      expect(matches).not.toBeNull()
      expect(matches?.groups?.protocol).toBe('mumbai')
      expect(matches?.groups?.type).toBe('collections-v2')
      expect(matches?.groups?.collectionAddress).toBe(contractAddress)
      expect(matches?.groups?.tokenId).toBe(tokenId)
    })
  })

  describe('and the urn to be checked is from a third party v1 item', () => {
    let thirdPartyName: string
    let collection_id: string
    let tokenId: string

    beforeEach(() => {
      thirdPartyName = 'crypto-motors'
      collection_id = 'some-name'
      tokenId = '1'
      decentralandURN = `urn:decentraland:matic:collections-thirdparty:${thirdPartyName}:${collection_id}:${tokenId}`
    })

    it('should match the URN', () => {
      expect(new RegExp(matchers.itemUrn).test(decentralandURN)).toBe(true)
    })

    it('should extract the network, the type, the third party name, the collection id and the item id', () => {
      const matches = new RegExp(matchers.itemUrn).exec(decentralandURN)

      expect(matches).not.toBeNull()
      expect(matches?.groups?.protocol).toBe('matic')
      expect(matches?.groups?.type).toBe('collections-thirdparty')
      expect(matches?.groups?.thirdPartyName).toBe(thirdPartyName)
      expect(matches?.groups?.thirdPartyCollectionId).toBe(collection_id)
      expect(matches?.groups?.thirdPartyTokenId).toBe(tokenId)
    })
  })

  describe('and the urn to be checked is from a third party v2 item', () => {
    let thirdPartyName: string
    let linkedCollectionNetwork: string
    let linkedCollectionAddress: string
    let tokenId: string

    beforeEach(() => {
      thirdPartyName = 'crypto-motors'
      linkedCollectionNetwork = 'mainnet'
      linkedCollectionAddress = '0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C'
      tokenId = '1'
      decentralandURN = `urn:decentraland:matic:collections-linked-wearables:${thirdPartyName}:${linkedCollectionNetwork}:${linkedCollectionAddress}:${tokenId}`
    })

    it('should match the URN', () => {
      expect(new RegExp(matchers.itemUrn).test(decentralandURN)).toBe(true)
    })

    it('should extract the network, the type, the third party name, the linked collection network, the linked collection address and the item id', () => {
      const matches = new RegExp(matchers.itemUrn).exec(decentralandURN)

      expect(matches).not.toBeNull()
      expect(matches?.groups?.protocol).toBe('matic')
      expect(matches?.groups?.type).toBe('collections-linked-wearables')
      expect(matches?.groups?.thirdPartyLinkedCollectionName).toBe(
        thirdPartyName
      )
      expect(matches?.groups?.linkedCollectionNetwork).toBe(
        linkedCollectionNetwork
      )
      expect(matches?.groups?.linkedCollectionContractAddress).toBe(
        linkedCollectionAddress
      )
      expect(matches?.groups?.thirdPartyTokenId).toBe(tokenId)
    })
  })

  describe('and the urn to be checked is invalid', () => {
    let decentralandURN: string

    beforeEach(() => {
      decentralandURN = 'an-invalid-urn'
    })

    it('should not match the URN', () => {
      expect(new RegExp(matchers.itemUrn).test(decentralandURN)).toBe(false)
    })
  })
})
