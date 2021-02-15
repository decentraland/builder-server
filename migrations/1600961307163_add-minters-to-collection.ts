import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = Collection.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, {
    minters: { type: 'TEXT[]', default: JSON.stringify({}), notNull: true },
  })
}
