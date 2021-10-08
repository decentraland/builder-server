/* eslint-disable @typescript-eslint/camelcase */
import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'
import { Item } from '../src/Item'

const collectionTableName = Collection.tableName
const itemTableName = Item.tableName
const column = 'urn_suffix'

/**
 * Migrates the DB by adding the URN column to the items and collections tables.
 * The urn_suffix column will be null for Decentraland Collections and for Third Party Collections
 * it will contain the collection part of the URN.
 * The urn_suffix column will be null for Decentraland Items and for Third Party Collections it will
 * contain the item part of the URN.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(itemTableName, {
    [column]: { type: 'TEXT', default: null, notNull: false },
  })

  pgm.addColumn(collectionTableName, {
    [column]: { type: 'TEXT', default: null, notNull: false },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(itemTableName, column)
  pgm.dropColumn(collectionTableName, column)
}
