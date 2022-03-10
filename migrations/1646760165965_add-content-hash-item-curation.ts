import { MigrationBuilder } from 'node-pg-migrate'
import { ItemCuration } from '../src/Curation/ItemCuration'

const tableName = ItemCuration.tableName
const columnName = 'content_hash'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(tableName, {
    [columnName]: { type: 'string', notNull: true },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, columnName)
}
