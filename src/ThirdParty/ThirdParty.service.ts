import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ItemCuration } from '../Curation/ItemCuration'
import { ThirdParty } from './ThirdParty.types'

export class ThirdPartyService {
  static async getThirdPartyAvailableSlots(
    thirdPartyId: ThirdParty['id']
  ): Promise<number> {
    const maxItems = await thirdPartyAPI.fetchMaxItemsByThirdParty(thirdPartyId)
    const itemCurationsCount = await ItemCuration.getItemCurationCountByThirdPartyId(
      thirdPartyId
    )
    return maxItems - itemCurationsCount[0].count
  }
}
