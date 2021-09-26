/* eslint-disable @typescript-eslint/camelcase */
import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'
import { Item } from '../src/Item'

const collectionTableName = Collection.tableName
const itemTableName = Item.tableName

export const shorthands = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(itemTableName, {
    urn: { type: 'TEXT' },
  })

  pgm.addColumn(collectionTableName, {
    urn: { type: 'TEXT' },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(itemTableName, 'urn')
  pgm.dropColumn(collectionTableName, 'urn')
}
