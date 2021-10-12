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

  // TODO: should we have unique names for all TPC collections?
  /**
   * Checks if a collection name is valid.
   * A collection name is valid if:
   * - There's no other collection that has the given name other than the one with the given id.
   * - There's no other collection that has the given name other than the one with the given id and urn suffix.
   *
   * @param id - The collection id.
   * @param name - The collection name to be changed or created.
   * @param urn_suffix - The collection URN suffix if the collection is a TWP one.
   */
  static async isValidName(
    id: string,
    name: string,
    urn_suffix?: string
  ): Promise<boolean> {
    const counts = await this.query(SQL`
    SELECT count(*) as count
      FROM ${raw(this.tableName)}
      WHERE id != ${id}
        AND (urn_suffix IS NULL${
          urn_suffix
            ? ` OR LOWER(urn_suffix) = ${urn_suffix.toLowerCase()}`
            : ''
        })
        AND LOWER(name) = ${name.toLowerCase()}`)

    return counts.length > 0 && counts[0].count <= 0
  }
}
