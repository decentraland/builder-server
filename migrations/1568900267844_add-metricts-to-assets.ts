import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'
import { Metrics } from '../src/Metrics'

const tableName = Asset.tableName

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
