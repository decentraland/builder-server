import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'
import { Curation } from '../src/Curation'

const tableName = Curation.tableName
const curationStatus = 'curation_status'

export const up = (pgm: MigrationBuilder) => {
  pgm.createType(curationStatus, ['pending', 'approved', 'rejected'])

  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      collection_id: { type: 'UUID', notNull: true },
      status: { type: 'CURATION_STATUS', notNull: true },
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
  pgm.dropType(curationStatus)
}
