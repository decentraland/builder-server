import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'
import { Collection, CollectionAttributes } from '../Collection'
import { getMergedCollection } from '../Collection/util'

export async function hasAccess(
  eth_address: string,
  collectionId: string
): Promise<boolean> {
  return (
    (await isCommitteeMember(eth_address)) ||
    (await getIsCollectionOwner(collectionId, eth_address)) ||
    isManager(eth_address, (await getMergedCollection(collectionId)).collection)
  )
}

function getIsCollectionOwner(collectionId: string, ethAddress: string) {
  return new Ownable(Collection).isOwnedBy(collectionId, ethAddress)
}

function isManager(ethAddress: string, collection?: CollectionAttributes) {
  return (
    collection?.managers.some((m) => m.toLowerCase() === ethAddress) || false
  )
}
