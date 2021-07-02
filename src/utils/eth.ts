import { providers } from 'ethers'
import { env } from 'decentraland-commons'
import { isContract } from 'decentraland-transactions'

export const MATIC_RPC_URL = env.get('MATIC_RPC_URL', '')

if (!MATIC_RPC_URL) {
  throw new Error('Please set a MATIC_RPC_URL env variable')
}

const provider = new providers.JsonRpcProvider(MATIC_RPC_URL)

export async function isPublished(collectionAddress: string) {
  return isContract(provider, collectionAddress)
}
