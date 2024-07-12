/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'

const column = 'mappings'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn(Item.tableName, column, {
    type: 'json',
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn(Item.tableName, column, {
    type: 'jsonb',
  })
}
