import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, {
    legacy_id: { type: 'TEXT' },
  })

  pgm.sql(
    `UPDATE ${tableName} SET legacy_id = ${tableName}.id WHERE script IS NULL`
  )
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, 'legacy_id')
}
