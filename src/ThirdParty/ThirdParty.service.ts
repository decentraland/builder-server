import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ItemCuration } from '../Curation/ItemCuration'
import { ThirdParty } from './ThirdParty.types'

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
}
