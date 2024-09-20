import { Model, raw, SQL } from 'decentraland-server'
import { VirtualThirdPartyAttributes } from './VirtualThirdParty.types'

export class VirtualThirdParty extends Model<VirtualThirdPartyAttributes> {
  static tableName = 'virtual_third_parties'

  static findByManager(
    address: string
  ): Promise<VirtualThirdPartyAttributes[]> {
    return this.query<VirtualThirdPartyAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)} vtp
        WHERE ${address} = ANY(vtp.managers)`)
  }
}
