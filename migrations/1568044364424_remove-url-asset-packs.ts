import { MigrationBuilder } from 'node-pg-migrate'
import { AssetPack } from '../src/AssetPack'

const tableName = AssetPack.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, 'url')
}
