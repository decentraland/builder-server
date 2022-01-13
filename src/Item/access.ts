import { CollectionAttributes } from '../Collection'
import { isManager as isCollectionManager } from '../Collection/access'
import { isTPCollection } from '../Collection/utils'
import { isCommitteeMember } from '../Committee'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Ownable } from '../Ownable'
import { Item } from './Item.model'
import { FullItem } from './Item.types'

export async function hasPublicAccess(
  eth_address: string,
  item: FullItem,
  collection?: CollectionAttributes
): Promise<boolean> {
  if (item.is_published) {
    return true
  }

  return hasAccess(eth_address, item, collection)
}

// TODO: Make TP enabled
export async function hasAccess(
  eth_address: string,
  item: FullItem,
  collection?: CollectionAttributes
): Promise<boolean> {
  const [isOwner, isCommittee] = await Promise.all([
    new Ownable(Item).isOwnedBy(item.id, eth_address),
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
      isManager = isCollectionManager(eth_address, collection)
    }
  }

  return isOwner || isCommittee || isManager
}
