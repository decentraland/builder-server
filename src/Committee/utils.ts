import { collectionAPI } from '../ethereum/api/collection'
import { AccountFragment } from '../ethereum/api/fragments'

const UPDATE_FREQUENCY = 1 * 60 * 60 * 1000 // An hour

let committee: AccountFragment[] = []
let shouldUpdateCommittee: boolean = false

export async function isCommitteeMember(address: string) {
  if (committee.length === 0 || shouldUpdateCommittee) {
    committee = await collectionAPI.fetchCommittee()

    setTimeout(() => (shouldUpdateCommittee = true), UPDATE_FREQUENCY)
    shouldUpdateCommittee = false
  }

  return committee.some((member) => member.address === address)
}
