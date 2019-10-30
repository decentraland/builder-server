import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.renameColumn(tableName, 'url', 'model')
}
