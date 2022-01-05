import { MigrationBuilder } from 'node-pg-migrate'
import { CollectionCuration } from '../src/Curation/CollectionCuration'

export const up = (pgm: MigrationBuilder) => {
  pgm.renameTable('curations', CollectionCuration.tableName)
}

export const down = (pgm: MigrationBuilder) => {
  pgm.renameTable(CollectionCuration.tableName, 'curations')
}
