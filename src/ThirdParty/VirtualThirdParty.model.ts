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
        WHERE ${address.toLowerCase()} = ANY(
          SELECT LOWER(m) FROM unnest(vtp.managers) AS m
        )`)
  }

  static async findByIds(
    ids: string[]
  ): Promise<Map<string, VirtualThirdPartyAttributes>> {
    if (ids.length === 0) {
      return new Map()
    }
    const rows = await this.query<VirtualThirdPartyAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)} vtp
        WHERE vtp.id = ANY(${ids})`)
    return new Map(rows.map((row) => [row.id, row]))
  }
}
