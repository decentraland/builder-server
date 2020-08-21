import { env } from 'decentraland-commons'

import { keccak256 } from '@ethersproject/solidity'

export class Salt {
  generate(seed: string = '') {
    return keccak256(['string'], [seed])
  }

  getContractAddress(salt: string, userAddress: string): string {
    const factoryCollectionAddress = env.get('FACTORY_COLLECTION_ADDRESS', '')
    if (!factoryCollectionAddress) {
      throw new Error('Invalid env variable FACTORY_COLLECTION_ADDRESS')
    }

    const factoryCollectionCodeHash = env.get(
      'FACTORY_COLLECTION_CODE_HASH',
      ''
    )
    if (!factoryCollectionCodeHash) {
      throw new Error('Invalid env variable FACTORY_COLLECTION_CODE_HASH')
    }

    const encoded = keccak256(
      ['bytes1', 'address', 'bytes32', 'bytes32'],
      [
        '0xff',
        factoryCollectionAddress,
        keccak256(['bytes32', 'address'], [salt, userAddress]),
        factoryCollectionCodeHash
      ]
    ).slice(-40)

    return `0x${encoded}`.toLowerCase()
  }
}
