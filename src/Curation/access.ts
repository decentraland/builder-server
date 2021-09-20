import { Curation } from './Curation.model'
import { CurationAttributes } from './Curation.types'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'

export async function hasAccess(
  eth_address: string,
  curation: CurationAttributes
): Promise<boolean> {
  if (curation.is_published) {
    return true
  }

  const [isOwner, isCommittee] = await Promise.all([
    new Ownable(Curation).isOwnedBy(curation.id, eth_address),
    isCommitteeMember(eth_address),
  ])

  return isOwner || isCommittee || isManager(eth_address, curation)
}

export function isManager(
  eth_address: string,
  collection: CurationAttributes
): boolean {
  return collection.managers.some(
    (manager: string) => manager.toLowerCase() === eth_address
  )
}
