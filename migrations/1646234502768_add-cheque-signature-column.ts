/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'
import { SlotUsageCheque } from '../src/SlotUsageCheque'

const tableName = SlotUsageCheque.tableName
const oldColumnName = 'signedMessage'

const columns = {
  signature: { type: 'TEXT', notNull: true },
  salt: { type: 'VARCHAR(66)', notNull: true },
  qty: { type: 'INT', notNull: true },
}

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, oldColumnName)
  pgm.addColumn(tableName, columns)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, columns)
  pgm.addColumn(tableName, {
    [oldColumnName]: { type: 'TEXT', notNull: true },
  })
}
