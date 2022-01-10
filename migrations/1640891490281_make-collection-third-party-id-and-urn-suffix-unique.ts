/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection/Collection.model'

const tableName = Collection.tableName
const thirdPartyIdColumnName = 'third_party_id'
const urnSuffixColumnName = 'urn_suffix'
const constraintName = `${thirdPartyIdColumnName}_${urnSuffixColumnName}_unique`

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createConstraint(tableName, constraintName, {
    unique: [thirdPartyIdColumnName, urnSuffixColumnName],
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(tableName, constraintName)
}
