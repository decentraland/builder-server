/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addExtension('pg_trgm', { ifNotExists: true })
  pgm.sql('SET pg_trgm.similarity_threshold = 0.5')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropExtension('pg_trgm')
}
