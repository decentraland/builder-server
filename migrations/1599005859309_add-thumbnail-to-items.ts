import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'

const tableName = Item.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, {
    thumbnail: { type: 'TEXT', notNull: true },
  })
}
