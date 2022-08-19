import { env } from 'decentraland-commons'

export function getDefaultEthAddress() {
  const defaultEthAddress = env.get('DEFAULT_ETH_ADDRESS', '').toLowerCase()
  if (!defaultEthAddress) {
    throw new Error(
      'You need to set a DEFAULT_ETH_ADDRESS on your env to set as the eth_address of each asset pack'
    )
  }
  return defaultEthAddress
}

export function getLimitSplitDate() {
  // This date, Fri Aug 19 2022, is an arbitrary cut for new assets and asset packs. It acts as an inflexion point for new business logic we want to use.
  // For example: If you create an asset pack after it, it'll have a limit in the amount of assets it can have
  return new Date(1660884520544)
}

export function isAfterLimitSplitDate(date: Date) {
  return new Date(date).getTime() >= getLimitSplitDate().getTime()
}
