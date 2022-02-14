import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item/Item.model'

const tableName = Item.tableName
const columnName = 'local_content_hash'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(tableName, {
    // Content-hash can be null if the item is not yet published for the DCL collections
    [columnName]: { type: 'string', notNull: false },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, columnName)
}
