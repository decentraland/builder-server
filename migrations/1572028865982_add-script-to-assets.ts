import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, {
    script: { type: 'TEXT' },
  })
}
