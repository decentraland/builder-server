import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = Collection.tableName
const columnName = 'forum_id'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(tableName, {
    [columnName]: { type: 'INT' },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, columnName)
}
