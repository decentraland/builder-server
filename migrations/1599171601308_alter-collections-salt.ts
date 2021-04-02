import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = Collection.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.alterColumn(tableName, 'salt', {
    type: 'TEXT'
  })
}
