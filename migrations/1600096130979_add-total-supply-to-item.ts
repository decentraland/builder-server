import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'

const tableName = Item.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, {
    total_supply: { type: 'INT', default: 0, notNull: true },
  })
}
