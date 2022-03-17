import { CollectionAttributes } from '../Collection'
import { isManager as isCollectionManager } from '../Collection/access'
import { isCommitteeMember } from '../Committee'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Ownable } from '../Ownable'
import { isTPCollection } from '../utils/urn'
import { Item } from './Item.model'
import { FullItem } from './Item.types'

/**
 * Checks if an item is accessible publicly.
 * @param eth_address - The address of the user to check access against.
 * @param item - The item that we're checking access to.
 * @param collection - The collection (if exists) of the item to check access to.
 */
export async function hasPublicAccess(
  eth_address: string,
  item: FullItem,
  collection?: CollectionAttributes
): Promise<boolean> {
  if (item.is_published) {
    return true
  }

  return hasAccess(eth_address, item.id, collection)
}

/**
 * Checks if an item is accessible.
 * If the collection is published, the method will check if the address is a manager of the collection.
 * @param eth_address - The address of the user to check access against.
 * @param item - The item that we're checking access to.
 * @param collection - The collection (if exists) of the item to check access to.
 */
export async function hasAccess(
  eth_address: string,
  itemId: string,
  collection?: CollectionAttributes
): Promise<boolean> {
  const [isOwner, isCommittee] = await Promise.all([
    new Ownable(Item).isOwnedBy(itemId, eth_address),
    isCommitteeMember(eth_address),
  ])

  let isManager = false
  if (collection) {
    if (isTPCollection(collection)) {
      isManager = await thirdPartyAPI.isManager(
        collection.third_party_id,
        eth_address
      )
    } else {
      // The function isManager only works for collections that were merged with a remote collection.
      // The is_published property exists only in merged collections.
      isManager =
        collection.is_published && isCollectionManager(eth_address, collection)
    }
  }

  return isOwner || isCommittee || isManager
}
