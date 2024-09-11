/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { VirtualThirdParty } from '../src/ThirdParty/VirtualThirdParty.model'

const update_updated_at_column_function_name = 'update_updated_at_column'
const update_updated_at_trigger_name = 'update_updated_at'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(VirtualThirdParty.tableName, {
    id: {
      type: 'TEXT',
      primaryKey: true,
      notNull: true,
    },
    managers: {
      type: 'TEXT',
      notNull: true,
    },
    raw_metadata: {
      type: 'TEXT',
      notNull: true,
    },
    created_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  })

  // Create the trigger function to automatically update the updated_at column
  pgm.createFunction(
    update_updated_at_column_function_name,
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
    },
    `
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    `
  )

  // Create the trigger
  pgm.createTrigger(
    VirtualThirdParty.tableName,
    update_updated_at_trigger_name,
    {
      when: 'BEFORE',
      operation: 'UPDATE',
      level: 'ROW',
      function: update_updated_at_column_function_name,
      condition: 'OLD.* IS DISTINCT FROM NEW.*',
    }
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop the trigger
  pgm.dropTrigger(VirtualThirdParty.tableName, update_updated_at_trigger_name)

  // Drop the trigger function
  pgm.dropFunction(update_updated_at_column_function_name, [])
  pgm.dropTable(VirtualThirdParty.tableName)
}
