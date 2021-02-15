import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'
import { Actions } from '../src/Asset/Actions'

const tableName = Asset.tableName

export const up = (pgm: MigrationBuilder) => {
  const attributes = new Actions().getAttributes()

  pgm.addColumn(tableName, {
    actions: {
      type: 'JSON',
      default: JSON.stringify(attributes),
      notNull: true,
    },
  })
}
