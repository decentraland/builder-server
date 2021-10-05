import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'

const tableName = Item.tableName
const columns = {
  is_published: { type: 'BOOLEAN', default: false, notNull: true },
  is_approved: { type: 'BOOLEAN', default: false, notNull: true },
  in_catalyst: { type: 'BOOLEAN', default: false, notNull: true },
}

export const up = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, Object.keys(columns))
}

export const down = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, columns)
}
