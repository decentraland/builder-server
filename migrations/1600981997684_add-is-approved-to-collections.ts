import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = Collection.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, {
    is_approved: { type: 'BOOLEAN', default: false, notNull: true },
  })
}
