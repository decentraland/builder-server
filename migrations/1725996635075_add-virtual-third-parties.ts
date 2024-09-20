/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { VirtualThirdParty } from '../src/ThirdParty/VirtualThirdParty.model'
import { Collection } from '../src/Collection/Collection.model'

const update_updated_at_column_function_name = 'update_updated_at_column'
const update_updated_at_trigger_name = 'update_updated_at'
const delete_virtual_third_party_function_name =
  'delete_virtual_third_party_function'
const delete_virtual_third_party_trigger_name =
  'delete_virtual_third_party_trigger'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(VirtualThirdParty.tableName, {
    id: {
      type: 'TEXT',
      primaryKey: true,
      notNull: true,
    },
    managers: {
      type: 'TEXT[]',
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

  // Create the trigger to update the updated_at column
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

  // Create the trigger function to delete a virtual third party if no collections are assigned
  pgm.createFunction(
    delete_virtual_third_party_function_name,
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
    },
    `
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM ${Collection.tableName} WHERE third_party_id = OLD.third_party_id) THEN
        DELETE FROM ${VirtualThirdParty.tableName} WHERE id = OLD.third_party_id;
      END IF;
      RETURN OLD;
    END;
    `
  )

  // Create the trigger to delete a virtual third party if no collections are assigned
  pgm.createTrigger(
    Collection.tableName,
    delete_virtual_third_party_trigger_name,
    {
      when: 'AFTER',
      operation: 'DELETE',
      level: 'ROW',
      function: delete_virtual_third_party_function_name,
    }
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop the triggers
  pgm.dropTrigger(VirtualThirdParty.tableName, update_updated_at_trigger_name)
  pgm.dropTrigger(Collection.tableName, delete_virtual_third_party_trigger_name)

  // Drop the trigger functions
  pgm.dropFunction(update_updated_at_column_function_name, [])
  pgm.dropFunction(delete_virtual_third_party_function_name, [])

  pgm.dropTable(VirtualThirdParty.tableName)
}
