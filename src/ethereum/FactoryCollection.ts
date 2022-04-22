import { keccak256 } from '@ethersproject/solidity'
import {
  FACTORY_COLLECTION_ADDRESS,
  FACTORY_COLLECTION_CODE_HASH,
  FORWARDER_CONTRACT_ADDRESS,
} from './types'
import { CHAIN_NAME } from './utils'

export class FactoryCollection {
  getSalt(seed: string = '') {
    return keccak256(['string'], [seed])
  }

  getContractAddress(salt: string, data: string): string {
    const address = FACTORY_COLLECTION_ADDRESS[CHAIN_NAME]
    if (!address) {
      throw new Error(
        `Could not find a factory collection address for chain name ${CHAIN_NAME}`
      )
    }

    const codeHash = FACTORY_COLLECTION_CODE_HASH[CHAIN_NAME]
    if (!codeHash) {
      throw new Error(
        `Could not find a factory collection hash for chain name ${CHAIN_NAME}`
      )
    }

    const forwarderAddress = FORWARDER_CONTRACT_ADDRESS[CHAIN_NAME]
    if (!forwarderAddress) {
      throw new Error(
        `Could not find a forwarder contract address for chain name ${CHAIN_NAME}`
      )
    }

    const encoded = keccak256(
      ['bytes1', 'address', 'bytes32', 'bytes32'],
      [
        '0xff',
        address,
        keccak256(
          ['bytes32', 'address', 'bytes'],
          [salt, forwarderAddress, data]
        ),
        codeHash,
      ]
    ).slice(-40)

    return `0x${encoded}`.toLowerCase()
  }
}
