/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'
import { SlotUsageCheque } from '../src/SlotUsageCheque'

const tableName = SlotUsageCheque.tableName
const newColumnName = 'signature'
const oldColumnName = 'signedMessage'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, oldColumnName)
  pgm.addColumn(tableName, {
    [newColumnName]: { type: 'TEXT', notNull: true },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, newColumnName)
  pgm.addColumn(tableName, {
    [oldColumnName]: { type: 'TEXT', notNull: true },
  })
}
