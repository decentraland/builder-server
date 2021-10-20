import { utils } from 'decentraland-commons'
import { ThirdPartyFragment } from '../ethereum/api/fragments'
import { ThirdParty } from './ThirdParty.types'

export function toThirdParty(fragment: ThirdPartyFragment): ThirdParty {
  const { thirdParty } = fragment.metadata

  return {
    ...utils.omit(fragment, ['metadata']),
    name: thirdParty?.name || '',
    description: thirdParty?.description || '',
  }
}
