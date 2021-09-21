import { Model, SQL } from 'decentraland-server'
import { CurationAttributes } from './Curation.types'

export class Curation extends Model<CurationAttributes> {
  static tableName = 'curations'

  static async findLatestForCollection(collectionId: string) {
    const result = await this.query<CurationAttributes>(SQL`
    SELECT * 
      FROM ${this.tableName}
      WHERE collection_id = ${collectionId}
      AND timestamp = (
        SELECT MAX(timestamp) 
        FROM ${this.tableName}
      )
    `)

    if (result.length === 0) {
      return undefined
    }

    return result[0]
  }
}
