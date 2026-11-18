import { MigrationBuilder } from 'node-pg-migrate'
import { CollectionCuration } from '../src/Curation/CollectionCuration'

const tableName = CollectionCuration.tableName
const constraintName = 'collection_curations_rejection_reasons_check'
const columnNames = ['reviewed_by', 'rejection_reasons', 'rejection_message']
const rejectionReasons = [
  'clipping',
  'thumbnail',
  'category_hides',
  'rigging',
  'triangle_count',
  'emote',
  'file_size',
  'textures_materials',
  'reversed_faces',
  'smart_wearable_files',
  'content_policy_ip',
  'other',
]

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns(tableName, {
    reviewed_by: { type: 'TEXT' },
    rejection_reasons: { type: 'TEXT[]' },
    rejection_message: { type: 'TEXT' },
  })
  pgm.addConstraint(tableName, constraintName, {
    check: `rejection_reasons <@ ARRAY[${rejectionReasons
      .map((reason) => `'${reason}'`)
      .join(',')}]::TEXT[]`,
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(tableName, constraintName)
  pgm.dropColumns(tableName, columnNames)
}
