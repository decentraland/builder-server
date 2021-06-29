import { providers } from 'ethers'
import { ChainId } from '@dcl/schemas'
import { RPC_URLS } from 'decentraland-connect'
import { env } from 'decentraland-commons'
import { isContract } from 'decentraland-transactions'

export const MATIC_CHAIN_ID = env.get(
  'MATIC_CHAIN_ID',
  ChainId.MATIC_MAINNET
) as ChainId

const rpcUrl = RPC_URLS[MATIC_CHAIN_ID]
const provider = new providers.JsonRpcProvider(rpcUrl)

export async function isPublished(collectionAddress: string) {
  return await isContract(provider, collectionAddress)
}
