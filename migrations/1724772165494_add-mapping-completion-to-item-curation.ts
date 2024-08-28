/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { ItemCuration } from '../src/Curation/ItemCuration'

const columnName = 'is_mapping_complete'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(ItemCuration.tableName, {
    [columnName]: { type: 'boolean', notNull: false },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(ItemCuration.tableName, columnName)
}
