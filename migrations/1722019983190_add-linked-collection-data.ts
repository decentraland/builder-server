/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(Collection.tableName, {
    linkedContract: { type: 'string', notNull: false },
    linkedNetwork: { type: 'string', notNull: false },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(Collection.tableName, ['linkedContract', 'linkedNetwork'])
}
