import { env } from 'decentraland-commons'

import { keccak256 } from '@ethersproject/solidity'
import {
  FACTORY_COLLECTION_ADDRESS,
  FACTORY_COLLECTION_CODE_HASH,
  FORWARDER_CONTRACT_ADDRESS,
  Network,
} from './types'

export class FactoryCollection {
  getSalt(seed: string = '') {
    return keccak256(['string'], [seed])
  }

  getContractAddress(salt: string): string {
    const network = env.get('ETHEREUM_NETWORK') as Network

    const address = FACTORY_COLLECTION_ADDRESS[network]
    if (!address) {
      throw new Error(
        `Could not find a factory collection address for network ${network}`
      )
    }

    const codeHash = FACTORY_COLLECTION_CODE_HASH[network]
    if (!codeHash) {
      throw new Error(
        `Could not find a factory collection hash for network ${network}`
      )
    }

    const forwarderAddress = FORWARDER_CONTRACT_ADDRESS[network]
    if (!forwarderAddress) {
      throw new Error(
        `Could not find a forwarder contract address for network ${network}`
      )
    }

    const encoded = keccak256(
      ['bytes1', 'address', 'bytes32', 'bytes32'],
      [
        '0xff',
        address,
        keccak256(['bytes32', 'address'], [salt, forwarderAddress]),
        codeHash,
      ]
    ).slice(-40)

    return `0x${encoded}`.toLowerCase()
  }
}
