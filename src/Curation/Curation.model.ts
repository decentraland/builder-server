import { Model, raw, SQL } from 'decentraland-server'

import { CurationAttributes } from './Curation.types'

export class Curation extends Model<CurationAttributes> {
  static tableName = 'curations'

  static findByContractAddresses(contractAddresses: string[]) {
    return this.query<CurationAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE contract_address = ANY(${contractAddresses})`)
  }

  static findByIds(ids: string[]) {
    return this.query<CurationAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE id = ANY(${ids})`)
  }

  static async isValidName(id: string, name: string) {
    const counts = await this.query(SQL`
    SELECT count(*) as count
      FROM ${raw(this.tableName)}
      WHERE id != ${id}
        AND LOWER(name) = ${name.toLowerCase()}`)

    return counts.length > 0 && counts[0].count <= 0
  }
}
