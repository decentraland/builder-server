import { Collection } from './Collection.model'
import { CollectionAttributes } from './Collection.types'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'

export async function hasAccess(
  eth_address: string,
  collection: CollectionAttributes
) {
  const isOwner = new Ownable(Collection).isOwnedBy(collection.id, eth_address)
  const isMember: boolean = await isCommitteeMember(eth_address)

  return isOwner || isMember || isManager(eth_address, collection)
}

export function isManager(
  eth_address: string,
  collection: CollectionAttributes
) {
  return collection.managers.some(
    (manager: string) => manager.toLowerCase() === eth_address
  )
}
