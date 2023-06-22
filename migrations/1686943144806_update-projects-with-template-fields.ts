import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName

/**
 * Migrates the DB by adding the is_template, video and template_status columns to the projects table.
 * The is_template column will be false for projects created by the users.
 * The video column will be null for projects created by the users or string for projects created as templates.
 * The template_status column will be null for projects created by the users or string for projects created as templates.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(tableName, {
    ['is_template']: { type: 'BOOLEAN', default: false, notNull: true },
    ['video']: { type: 'TEXT', default: null, notNull: false },
    ['template_status']: { type: 'TEXT', default: null, notNull: false },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, 'is_template')
  pgm.dropColumn(tableName, 'video')
  pgm.dropColumn(tableName, 'template_status')
}
