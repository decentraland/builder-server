import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'
import { Parameters } from '../src/Asset/Parameters'

const tableName = Asset.tableName

export const up = (pgm: MigrationBuilder) => {
  const attributes = new Parameters().getAttributes()

  pgm.addColumn(tableName, {
    parameters: {
      type: 'JSON',
      default: JSON.stringify(attributes),
      notNull: true,
    },
  })
}
