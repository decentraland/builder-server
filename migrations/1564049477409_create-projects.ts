import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, notNull: true },
      address: { type: 'TEXT', primaryKey: true, notNull: true },
      title: { type: 'TEXT' },
      description: { type: 'TEXT' },
      thumbnail: { type: 'TEXT' },
      scene_id: { type: 'UUID' },
      user_id: { type: 'TEXT' },
      layout: { type: 'JSON' },
      created_at: { type: 'BIGINT', notNull: true },
      updated_at: { type: 'BIGINT', notNull: true }
    },
    { ifNotExists: true }
  )
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
