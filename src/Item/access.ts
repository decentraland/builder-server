import { CollectionAttributes } from '../Collection'
import { isManager as isCollectionManager } from '../Collection/access'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'
import { Item } from './Item.model'
import { FullItem } from './Item.types'

export async function hasAccess(
  eth_address: string,
  item: FullItem,
  collection?: CollectionAttributes
): Promise<boolean> {
  if (item.is_published) {
    return true
  }

  const [isOwner, isCommittee] = await Promise.all([
    new Ownable(Item).isOwnedBy(item.id, eth_address),
    isCommitteeMember(eth_address),
  ])

  const isManager: boolean = collection
    ? isCollectionManager(eth_address, collection)
    : false

  return isOwner || isCommittee || isManager
}
