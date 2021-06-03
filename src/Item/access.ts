import { CollectionAttributes } from '../Collection'
import { isManager as isCollectionManager } from '../Collection/access'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'
import { Item } from './Item.model'
import { ItemAttributes } from './Item.types'

export async function hasAccess(
  eth_address: string,
  item: ItemAttributes,
  collection?: CollectionAttributes
) {
  const isOwner = new Ownable(Item).isOwnedBy(item.id, eth_address)
  const isMember: boolean = await isCommitteeMember(eth_address)

  const isManager: boolean = collection
    ? isCollectionManager(eth_address, collection)
    : false

  return isOwner || isMember || isManager
}
