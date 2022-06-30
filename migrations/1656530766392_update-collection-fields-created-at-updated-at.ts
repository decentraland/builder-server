/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate';
import { Collection } from '../src/Collection'

const tableName = Collection.tableName
const columnCreatedAt = 'created_at'
const columnUpdatedAt = 'updated_at'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn(tableName, columnCreatedAt, {default: pgm.func('current_timestamp')})
  pgm.alterColumn(tableName, columnUpdatedAt, {default: pgm.func('current_timestamp')})
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn(tableName, columnCreatedAt, {default: null})
  pgm.alterColumn(tableName, columnUpdatedAt, {default: null})
}
