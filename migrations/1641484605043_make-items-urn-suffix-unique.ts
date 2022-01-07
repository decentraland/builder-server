import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item/Item.model'

const tableName = Item.tableName
const urnSuffixColumnName = 'urn_suffix'
const collectionIdColumnName = 'collection_id'
const constraintName = `${collectionIdColumnName}_${urnSuffixColumnName}_unique`

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createConstraint(tableName, constraintName, {
    unique: [collectionIdColumnName, urnSuffixColumnName],
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(tableName, constraintName)
}
