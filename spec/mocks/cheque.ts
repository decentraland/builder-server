import { ChainId } from '@dcl/schemas'
import {
  ContractData,
  ContractName,
  getContract,
} from 'decentraland-transactions'
import { ethers, utils } from 'ethers'
import { getMappedChainIdForCurrentChainName } from '../../src/ethereum'

export async function generateCheque(
  thirdPartyId: string,
  qty: number,
  wallet: ethers.Wallet
) {
  const maticChainId: ChainId = getMappedChainIdForCurrentChainName()
  const thirdPartyContract: ContractData = getContract(
    ContractName.ThirdPartyRegistry,
    maticChainId
  )

  const salt = utils.hexlify(utils.randomBytes(32))
  const domain = {
    name: thirdPartyContract.name,
    verifyingContract: thirdPartyContract.address,
    version: thirdPartyContract.version,
    salt: utils.hexZeroPad(utils.hexlify(maticChainId), 32),
  }
  const dataToSign = {
    thirdPartyId,
    qty,
    salt,
  }
  const domainTypes = {
    ConsumeSlots: [
      { name: 'thirdPartyId', type: 'string' },
      { name: 'qty', type: 'uint256' },
      { name: 'salt', type: 'bytes32' },
    ],
  }

  const signature = await wallet._signTypedData(domain, domainTypes, dataToSign)

  return { signature, salt, qty }
}
