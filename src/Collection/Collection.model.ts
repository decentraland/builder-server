import { Model, raw, SQL } from 'decentraland-server'

import { Item } from '../Item/Item.model'
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

  static async findByOwnerOfItem(
    itemId: string
  ): Promise<CollectionAttributes> {
    const collections = await this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE ${raw(this.tableName)}.id IN (SELECT collection_id FROM ${raw(
      Item.tableName
    )}) WHERE ${raw(Item.tableName)}.id = ${itemId}) LIMIT 1`)

    if (collections.length === 0) {
      throw new Error('Collection not found')
    }
    return collections[0]
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
        AND urn_suffix IS NULL
        AND LOWER(name) = ${name.toLowerCase()}`)

    return counts.length > 0 && counts[0].count <= 0
  }
}
