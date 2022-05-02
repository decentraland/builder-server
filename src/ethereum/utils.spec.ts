import { ChainName } from '@dcl/schemas'
import { env } from 'decentraland-commons'
import { getFactoryCollectionCodeHash } from './utils'

jest.mock('decentraland-commons')

const mockEnv = env as jest.Mocked<typeof env>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('when obtaining the codehash', () => {
  describe('when CHAIN_NAME === "Ethereum Mainnet" && COLLECTION_FACTORY_VERSION === undefined', () => {
    it('should return the codehash for the factory v2 in matic mainnet', async () => {
      mockEnv.get
        .mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)
        .mockReturnValueOnce(undefined)

      expect(getFactoryCollectionCodeHash()).toBe(
        '0x4b1f8521034f9cc96eb813b6209f732f73b24abd7673e0ad5aac8c8c46b5ad9c'
      )
    })
  })

  describe('when CHAIN_NAME === "Ropsten" && COLLECTION_FACTORY_VERSION === undefined', () => {
    it('should return the codehash for the factory v2 in matic mumbai', async () => {
      mockEnv.get
        .mockReturnValueOnce(ChainName.ETHEREUM_ROPSTEN)
        .mockReturnValueOnce(undefined)

      expect(getFactoryCollectionCodeHash()).toBe(
        '0xf80db993258f789573529f80d215588a9b5973d1dcea7663d5822392fb7fd667'
      )
    })
  })

  describe('when CHAIN_NAME === "Ethereum Mainnet" && COLLECTION_FACTORY_VERSION === "2"', () => {
    it('should return the codehash for the factory v2 in matic mainnet', async () => {
      mockEnv.get
        .mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)
        .mockReturnValueOnce('2')

      expect(getFactoryCollectionCodeHash()).toBe(
        '0x4b1f8521034f9cc96eb813b6209f732f73b24abd7673e0ad5aac8c8c46b5ad9c'
      )
    })
  })

  describe('when CHAIN_NAME === "Ropsten" && COLLECTION_FACTORY_VERSION === "2"', () => {
    it('should return the codehash for the factory v2 in matic mumbai', async () => {
      mockEnv.get
        .mockReturnValueOnce(ChainName.ETHEREUM_ROPSTEN)
        .mockReturnValueOnce('2')

      expect(getFactoryCollectionCodeHash()).toBe(
        '0xf80db993258f789573529f80d215588a9b5973d1dcea7663d5822392fb7fd667'
      )
    })
  })

  describe('when CHAIN_NAME === "Ethereum Mainnet" && COLLECTION_FACTORY_VERSION === "3"', () => {
    it('should throw an error complaining that the collection factory v3 is not supported in that network', async () => {
      mockEnv.get
        .mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)
        .mockReturnValueOnce('3')

      expect(() => getFactoryCollectionCodeHash()).toThrow(
        'Not yet supported on Matic Mainnet'
      )
    })
  })

  describe('when CHAIN_NAME === "Ropsten" && COLLECTION_FACTORY_VERSION === "3"', () => {
    it('should return the codehash for the factory v3 in matic mumbai', async () => {
      mockEnv.get
        .mockReturnValueOnce(ChainName.ETHEREUM_ROPSTEN)
        .mockReturnValueOnce('3')

      expect(getFactoryCollectionCodeHash()).toBe(
        '0x7917e9ddbe5e0fd8de84efee3e8089ca7878af7a6aa1a62b4d0b6160821d4de8'
      )
    })
  })
})
