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

  describe('when CHAIN_NAME === "Sepolia"', () => {
    it('should return the address of the forwarder in matic amoy', () => {
      mockEnv.get.mockReturnValueOnce(ChainName.ETHEREUM_SEPOLIA)

      expect(getForwarderAddress()).toBe(
        '0x7b1fe9de545b22cb553766817b84d655ce8121c9'
      )
    })
  })
})

describe('when obtaining the collection factory address', () => {
  describe('when CHAIN_NAME === "Ethereum Mainnet"', () => {
    it('should return the collection factory v3 address on matic mainnet', () => {
      mockEnv.get.mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)

      expect(getFactoryCollectionAddress()).toBe(
        '0x3195e88aE10704b359764CB38e429D24f1c2f781'
      )
    })
  })

  describe('when CHAIN_NAME === "Sepolia"', () => {
    it('should return the collection factory v3 address on matic amoy', () => {
      mockEnv.get.mockReturnValueOnce(ChainName.ETHEREUM_SEPOLIA)

      expect(getFactoryCollectionAddress()).toBe(
        '0x802de0c509add2ee29de24de7225daaff4741c43'
      )
    })
  })
})

describe('when obtaining the codehash', () => {
  describe('when CHAIN_NAME === "Ethereum Mainnet"', () => {
    it('should return the codehash for the factory v3 in matic mainnet', async () => {
      mockEnv.get.mockReturnValueOnce(ChainName.ETHEREUM_MAINNET)

      expect(getFactoryCollectionCodeHash()).toBe(
        '0x5a1d707e8f0be7be88213a8216231468689b96dcd4abed0931276f4886a87beb'
      )
    })
  })

  describe('when CHAIN_NAME === "Sepolia"', () => {
    it('should return the codehash for the factory v3 in matic amoy', async () => {
      mockEnv.get.mockReturnValueOnce(ChainName.ETHEREUM_SEPOLIA)

      expect(getFactoryCollectionCodeHash()).toBe(
        '0xe8aa6287567a0945907cc65108e8b18ba8cd8bff5675eb3b3d405125525ed1cf'
      )
    })
  })
})
