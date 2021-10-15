import { env } from 'decentraland-commons'
const MANAGERS = env
  .get('TPW_MANAGER_ADDRESSES', '')
  .split(/[ ,]+/)
  .map((address) => address.toLowerCase())
/**
 * Checks if an address manages a third party wearable collection.
 *
 * @param urn - The URN of the TWP collection where to get the information about the collection.
 * @param address - The address to check if it manages the collection.
 */
export function isManager(_: string, address: string): Promise<boolean> {
  if (MANAGERS.includes(address.toLowerCase())) {
    return Promise.resolve(true)
  }
  return Promise.resolve(false)
}
