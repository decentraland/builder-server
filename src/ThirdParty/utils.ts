import { utils } from 'decentraland-commons'
import { ThirdPartyFragment } from '../ethereum/api/fragments'
import { ThirdParty } from './ThirdParty.types'

export function toThirdParty(fragment: ThirdPartyFragment): ThirdParty {
  const { name, description } = fragment.metadata.thirdParty
  return {
    ...utils.omit(fragment, ['metadata']),
    name,
    description,
  }
}
