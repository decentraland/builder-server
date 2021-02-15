import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'
import { Metrics } from '../src/Metrics'

const tableName = Item.tableName

export const up = (pgm: MigrationBuilder) => {
  const attributes = new Metrics().getAttributes()

  pgm.addColumn(tableName, {
    metrics: {
      type: 'JSON',
      default: JSON.stringify(attributes),
      notNull: true,
    },
  })
}
