import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Collection } from './Collection.model'
import { CollectionAttributes } from './Collection.types'
import { isCommitteeMember } from '../Committee'
import { isTPCollection } from '../utils/urn'
import { Ownable } from '../Ownable'

export async function hasPublicAccess(
  eth_address: string,
  collection: CollectionAttributes
): Promise<boolean> {
  if (collection.is_published) {
    return true
  }

  return hasAccess(eth_address, collection)
}

export async function hasAccess(
  eth_address: string,
  collection: CollectionAttributes
): Promise<boolean> {
  const [isOwner, isCommittee, hasManagerAccess] = await Promise.all([
    new Ownable(Collection).isOwnedBy(collection.id, eth_address),
    isCommitteeMember(eth_address),
    isTPCollection(collection)
      ? thirdPartyAPI.isManager(collection.third_party_id, eth_address)
      : // The function isManager only works for collections that were merged with a remote collection.
        // The is_published property exists only in merged collections.
        !!collection.is_published && isManager(eth_address, collection),
  ])

  return isOwner || isCommittee || hasManagerAccess
}

export function isManager(
  eth_address: string,
  collection: CollectionAttributes
): boolean {
  return collection.managers.some(
    (manager: string) => manager.toLowerCase() === eth_address
  )
}
