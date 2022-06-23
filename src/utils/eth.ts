import { env } from 'decentraland-commons'
import { providers } from 'ethers'
import { isContract } from 'decentraland-transactions'

export function getRpcUrl(): string {
  const rpcUrl = env.get<string | undefined>('RPC_URL')

  if (!rpcUrl) {
    throw new Error('RPC_URL not defined')
  }

  return rpcUrl
}

export async function isPublished(collectionAddress: string) {
  const provider = new providers.JsonRpcProvider(getRpcUrl())
  return isContract(provider, collectionAddress)
}
