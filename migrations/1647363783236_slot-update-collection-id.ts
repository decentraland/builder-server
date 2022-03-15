import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'
import { SlotUsageCheque } from '../src/SlotUsageCheque'

const tableName = SlotUsageCheque.tableName

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn(tableName, 'collection_id', {
    type: 'UUID',
    using: 'uuid_generate_v4()',
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn(tableName, 'collection_id', {
    type: 'text',
  })
}
