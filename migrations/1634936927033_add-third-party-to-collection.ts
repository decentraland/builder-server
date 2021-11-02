import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = Collection.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, {
    third_party_id: { type: 'TEXT' },
  })
  pgm.addIndex(tableName, 'third_party_id')
}
