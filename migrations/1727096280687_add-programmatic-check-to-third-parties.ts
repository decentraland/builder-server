/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { VirtualThirdParty } from '../src/ThirdParty/VirtualThirdParty.model'

const newColumnName = 'isProgrammatic'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(VirtualThirdParty.tableName, {
    [newColumnName]: { type: 'BOOLEAN', notNull: true, default: false },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(VirtualThirdParty.tableName, newColumnName)
}
