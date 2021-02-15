import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumns(tableName, {
    is_deleted: { type: 'BOOLEAN', default: false, notNull: true },
  })
}
