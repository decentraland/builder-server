import { MigrationBuilder } from 'node-pg-migrate'
import { CollectionCuration } from '../src/Curation/CollectionCuration'

const tableName = CollectionCuration.tableName
const columnName = 'assignee'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(tableName, {
    [columnName]: { type: 'TEXT' },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, columnName)
}
