import { Model, raw, SQL } from 'decentraland-server'
import { CurationAttributes } from './Curation.types'

export class Curation extends Model<CurationAttributes> {
  static tableName = 'curations'

  static getAllLatestByCollection() {
    return this.query<CurationAttributes>(SQL`
    SELECT DISTINCT ON (collection_id) * FROM ${raw(this.tableName)} AS c1
    WHERE created_at = (
	    SELECT MAX(created_at) FROM ${raw(this.tableName)} AS c2
	    WHERE c1.collection_id = c2.collection_id
    )`)
  }

  static getAllLatestForCollections(collectionIds: string[]) {
    return this.query<CurationAttributes>(SQL`
    SELECT DISTINCT ON (collection_id) * FROM ${raw(this.tableName)} AS cu1
    WHERE collection_id = ANY(${collectionIds})
    AND created_at = (
      SELECT max(created_at) FROM ${raw(this.tableName)} AS cu2
      WHERE cu1.collection_id = cu2.collection_id
    )`)
  }

  static async getLatestForCollection(
    collectionId: string
  ): Promise<CurationAttributes | undefined> {
    const query = SQL`
    SELECT DISTINCT ON (collection_id) * FROM ${raw(this.tableName)}
    WHERE collection_id = ${collectionId}
    AND created_at = (
      SELECT MAX(created_at)
      FROM ${raw(this.tableName)}
    )`

    return (await this.query<CurationAttributes>(query))[0]
  }
}
