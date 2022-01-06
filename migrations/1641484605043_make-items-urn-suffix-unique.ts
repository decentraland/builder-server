/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item/Item.model'

const tableName = Item.tableName
const urnSuffixColumnName = 'urn_suffix'
const constraintName = `${urnSuffixColumnName}_unique`

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createConstraint(tableName, constraintName, {
    unique: [urnSuffixColumnName],
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(tableName, constraintName)
}
