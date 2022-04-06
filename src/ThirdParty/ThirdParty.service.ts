import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ItemCuration } from '../Curation/ItemCuration'
import { ThirdParty } from './ThirdParty.types'
import { toThirdParty } from './utils'
import { NonExistentThirdPartyError } from './ThirdParty.errors'

export class ThirdPartyService {
  async getThirdPartyAvailableSlots(
    thirdPartyId: ThirdParty['id']
  ): Promise<number> {
    const [maxItems, itemCurationsCount] = await Promise.all([
      thirdPartyAPI.fetchMaxItemsByThirdParty(thirdPartyId),
      ItemCuration.countByThirdPartyId(thirdPartyId),
    ])
    return maxItems - itemCurationsCount
  }

  async getThirdParties(manager?: string): Promise<ThirdParty[]> {
    const fragments = await thirdPartyAPI.fetchThirdPartiesByManager(manager)
    return fragments.map(toThirdParty)
  }

  async getThirdParty(thirdPartyId: ThirdParty['id']): Promise<ThirdParty> {
    const thirdParty = await thirdPartyAPI.fetchThirdParty(thirdPartyId)

    if (!thirdParty) {
      throw new NonExistentThirdPartyError(thirdPartyId)
    }

    return toThirdParty(thirdParty)
  }
}
