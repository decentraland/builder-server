import { MigrationBuilder } from 'node-pg-migrate'

export const up = async (pgm: MigrationBuilder) => {
  pgm.createExtension('uuid-ossp', { ifNotExists: true })
}

export const down = async (pgm: MigrationBuilder) => {
  pgm.dropExtension('uuid-ossp')
}
