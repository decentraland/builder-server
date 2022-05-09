import { ChainName } from '@dcl/schemas'
import { env } from 'decentraland-commons'
import {
  getFactoryCollectionAddress,
  getFactoryCollectionCodeHash,
  getForwarderAddress,
} from './utils'

jest.mock('decentraland-commons')

const mockEnv = env as jest.Mocked<typeof env>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('when obtaining the forwarder address', () => {
  describe('when CHAIN_NAME === "Ethereum Mainnet"', () => {
    it('should return the address of the forwarder in matic mainnet', () => {
      mockEnv.get.mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)

      expect(getForwarderAddress()).toBe(
        '0xBF6755A83C0dCDBB2933A96EA778E00b717d7004'
      )
    })
  })

  describe('when CHAIN_NAME === "Ropsten"', () => {
    it('should return the address of the forwarder in matic mumbai', () => {
      mockEnv.get.mockReturnValueOnce(ChainName.ETHEREUM_ROPSTEN)

      expect(getForwarderAddress()).toBe(
        '0x71e56Ad57eca3fAAe5077b7F9ea731a25785fF92'
      )
    })
  })
})

describe('when obtaining the collection factory address', () => {
  describe('when CHAIN_NAME === "Ethereum Mainnet" && COLLECTION_FACTORY_VERSION === undefined', () => {
    it('should return the collection factory v2 address on matic mainnet', () => {
      mockEnv.get
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)

      expect(getFactoryCollectionAddress()).toBe(
        '0xB549B2442b2BD0a53795BC5cDcBFE0cAF7ACA9f8'
      )
    })
  })

  describe('when CHAIN_NAME === "Ropsten" && COLLECTION_FACTORY_VERSION === undefined', () => {
    it('should return the collection factory v2 address on matic mumbai', () => {
      mockEnv.get
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(ChainName.ETHEREUM_ROPSTEN)

      expect(getFactoryCollectionAddress()).toBe(
        '0x2A72Ec4241Ac4fBc915ae98aC5a5b01AdE721f4B'
      )
    })
  })

  describe('when CHAIN_NAME === "Ethereum Mainnet" && COLLECTION_FACTORY_VERSION === 3', () => {
    it('should return the collection factory v3 address on matic mainnet', () => {
      mockEnv.get
        .mockReturnValueOnce('3')
        .mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)

      expect(getFactoryCollectionAddress()).toBe(
        '0x3195e88aE10704b359764CB38e429D24f1c2f781'
      )
    })
  })

  describe('when CHAIN_NAME === "Ropsten" && COLLECTION_FACTORY_VERSION === 3', () => {
    it('should return the collection factory v3 address on matic mumbai', () => {
      mockEnv.get
        .mockReturnValueOnce('3')
        .mockReturnValueOnce(ChainName.ETHEREUM_ROPSTEN)

      expect(getFactoryCollectionAddress()).toBe(
        '0xDDb3781Fff645325C8896AA1F067bAa381607ecc'
      )
    })
  })
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
    it('should return the codehash for the factory v3 in matic mainnet', async () => {
      mockEnv.get
        .mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)
        .mockReturnValueOnce('3')

      expect(getFactoryCollectionCodeHash()).toBe(
        '0x5a1d707e8f0be7be88213a8216231468689b96dcd4abed0931276f4886a87beb'
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
