import { env } from 'decentraland-commons'

export function isUsingRaritiesWithOracle(): boolean {
  return env.get<string | undefined>('FF_RARITIES_WITH_ORACLE') === '1'
}

export function getMaticRpcUrl(): string {
  const maticRpcUrl = env.get<string | undefined>('MATIC_RPC_URL')

  if (!maticRpcUrl) {
    throw new Error('MATIC_RPC_URL not defined')
  }

  return maticRpcUrl
}
