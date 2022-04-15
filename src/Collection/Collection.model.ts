import { Model, raw, SQL } from 'decentraland-server'
import { Item } from '../Item/Item.model'
import { CollectionAttributes } from './Collection.types'

type CollectionWithItemCount = CollectionAttributes & {
  item_count: number
}

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static findAll() {
    return this.query<CollectionWithItemCount>(SQL`
      SELECT *, (SELECT COUNT(*) FROM ${raw(
        Item.tableName
      )} WHERE items.collection_id = collections.id) as item_count
        FROM ${raw(this.tableName)}
      `)
  }

  static findByAllByAddress(address: string) {
    return this.query<CollectionWithItemCount>(SQL`
      SELECT *, (SELECT COUNT(*) FROM ${raw(
        Item.tableName
      )} WHERE items.collection_id = collections.id) as item_count
        FROM ${raw(this.tableName)}
        WHERE eth_address = ${address}
      `)
  }

  static findByIds(ids: string[]) {
    return this.query<CollectionWithItemCount>(SQL`
    SELECT *, (SELECT COUNT(*) FROM ${raw(
      Item.tableName
    )} WHERE items.collection_id = collections.id) as item_count
      FROM ${raw(this.tableName)}
      WHERE id = ANY(${ids})`)
  }

  static findByThirdPartyIds(thirdPartyIds: string[]) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *, (SELECT COUNT(*) FROM ${raw(
      Item.tableName
    )} WHERE items.collection_id = collections.id) as item_count
      FROM ${raw(this.tableName)}
      WHERE third_party_id = ANY(${thirdPartyIds})`)
  }

  static findByContractAddresses(contractAddresses: string[]) {
    return this.query<CollectionAttributes>(SQL`
      SELECT *, (SELECT COUNT(*) FROM ${raw(
        Item.tableName
      )} WHERE items.collection_id = collections.id) as item_count
        FROM ${raw(this.tableName)}
        WHERE contract_address = ANY(${contractAddresses})`)
  }

  static async findByItemId(
    itemId: string
  ): Promise<CollectionAttributes | undefined> {
    const collections = await this.query<CollectionAttributes>(SQL`
    SELECT collections.*
      FROM ${raw(this.tableName)} collections
      JOIN ${raw(Item.tableName)} items ON collections.id = items.collection_id
      WHERE items.id = ${itemId}`)

    return collections[0]
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

  static async upsertWithItemCount(
    collection: CollectionAttributes
  ): Promise<CollectionWithItemCount> {
    const { id, ...attributes } = collection
    const columnNames = ['id', ...Object.keys(attributes)]
    const columnValues = [id, ...Object.values(attributes)]

    const insertColumns = columnNames.map((name) => `"${name}"`)
    const insertValues = columnNames.map((_, index) => `$${index + 1}`)

    const updateFields = columnNames
      .slice(1)
      .map((name, index) => `${name} = $${index + 2}`)

    const result = await this.query<CollectionWithItemCount>(
      SQL`
    INSERT INTO ${raw(this.tableName)} as collections (${raw(
        insertColumns.join(', ')
      )})
      VALUES (${raw(insertValues.join(', '))})
      ON CONFLICT (id)
      DO UPDATE SET ${raw(updateFields.join(', '))}
      RETURNING *, (SELECT COUNT(*) FROM ${raw(
        Item.tableName
      )} WHERE collections.id = items.collection_id) as item_count`,
      columnValues
    )

    return result[0]
  }
}
