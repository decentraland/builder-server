import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'
import { Curation } from '../src/Curation'

const tableName = Curation.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      collection_id: { type: 'UUID', notNull: true },
      timestamp: { type: 'TIMESTAMP', notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    {
      ifNotExists: true,
      constraints: {
        foreignKeys: {
          references: Collection.tableName,
          columns: 'collection_id',
          onDelete: 'CASCADE',
        },
      },
    }
  )

  pgm.createIndex(tableName, 'collection_id')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
