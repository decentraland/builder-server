import { Collection } from './Collection.model'
import { CollectionAttributes } from './Collection.types'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'

export async function hasAccess(
  eth_address: string,
  collection: CollectionAttributes
): Promise<boolean> {
  const [isOwner, isCommittee] = await Promise.all([
    new Ownable(Collection).isOwnedBy(collection.id, eth_address),
    isCommitteeMember(eth_address),
  ])

  return isOwner || isCommittee || isManager(eth_address, collection)
}

export function isManager(
  eth_address: string,
  collection: CollectionAttributes
): boolean {
  return collection.managers.some(
    (manager: string) => manager.toLowerCase() === eth_address
  )
}
