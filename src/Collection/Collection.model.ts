import { Model, raw, SQL } from 'decentraland-server'
import { CollectionAttributes } from './Collection.types'

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static findByContractAddresses(contractAddresses: string[]) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE contract_address = ANY(${contractAddresses})`)
  }

  static findByIds(ids: string[]) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE id = ANY(${ids})`)
  }

  static findByThirdPartyIds(thirdPartyIds: string[]) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE third_party_id = ANY(${thirdPartyIds})`)
  }

  static async isURNRepeated(
    id: string,
    thirdPartyId: string,
    urnSuffix: string
  ): Promise<boolean> {
    const counts = await this.query<{ count: number }>(SQL`
      SELECT COUNT(*) as count
        FROM ${raw(this.tableName)}
        WHERE id != ${id}
          AND third_party_id = ${thirdPartyId}
          AND urn_suffix = ${urnSuffix}`)

    return counts[0].count > 0
  }

  /**
   * Checks if a collection name is valid.
   * A collection name is valid if there's no other collection that has the given
   * name other than the one with the given id.
   *
   * @param id - The collection id.
   * @param name - The collection name to be changed or created.
   */
  static async isValidName(id: string, name: string): Promise<boolean> {
    const counts = await this.query(SQL`
    SELECT count(*) as count
      FROM ${raw(this.tableName)}
      WHERE id != ${id}
        AND third_party_id IS NULL
        AND urn_suffix IS NULL
        AND LOWER(name) = ${name.toLowerCase()}`)

    return counts.length > 0 && counts[0].count <= 0
  }
}
