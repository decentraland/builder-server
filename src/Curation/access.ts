import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'
import { Collection, CollectionAttributes } from '../Collection'
import { getMergedCollection } from '../Collection/utils'

export async function hasAccessToCollection(
  ethAddress: string,
  collectionId: string
): Promise<boolean> {
  return (
    (await isCommitteeMember(ethAddress)) ||
    (await getIsCollectionOwner(collectionId, ethAddress)) ||
    isManager(ethAddress, (await getMergedCollection(collectionId)).collection)
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
