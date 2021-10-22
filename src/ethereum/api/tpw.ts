import { env } from 'decentraland-commons'
import { thirdPartyAPI } from './thirdParty'

/**
 * Checks if an address manages a third party wearable collection.
 *
 * @param urn - The URN of the TWP collection where to get the information about the collection.
 * @param address - The address to check if it manages the collection.
 */
export async function isManager(
  urn: string,
  address: string
): Promise<boolean> {
  if (isEnvManager(address)) {
    return true
  }

  return await thirdPartyAPI.isManager(urn, address)
}

function isEnvManager(address: string) {
  return (
    !env.isProduction() &&
    env
      .get('TPW_MANAGER_ADDRESSES', '')
      .toLowerCase()
      .search(address.toLowerCase()) > -1
  )
}
