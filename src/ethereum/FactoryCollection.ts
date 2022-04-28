import { keccak256 } from '@ethersproject/solidity'
import {
  getFactoryCollectionAddress,
  getFactoryCollectionCodeHash,
  getForwarderAddress,
} from './utils'

export class FactoryCollection {
  getSalt(seed: string = '') {
    return keccak256(['string'], [seed])
  }

  getContractAddress(salt: string, data: string): string {
    const address = getFactoryCollectionAddress()
    const codeHash = getFactoryCollectionCodeHash()
    const forwarderAddress = getForwarderAddress()

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
