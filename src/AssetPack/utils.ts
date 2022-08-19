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
  return new Date(1660884520544) // 19 Aug
}

export function isAfterLimitSplitDate(date: Date) {
  return date.getTime() >= getLimitSplitDate().getTime()
}
