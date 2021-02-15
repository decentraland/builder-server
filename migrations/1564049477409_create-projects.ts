import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      title: { type: 'TEXT', notNull: true },
      description: { type: 'TEXT' },
      thumbnail: { type: 'TEXT' },
      scene_id: { type: 'UUID', notNull: true },
      user_id: { type: 'TEXT', notNull: true },
      cols: { type: 'INT', notNull: true },
      rows: { type: 'INT', notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, 'user_id')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
