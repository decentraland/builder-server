/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const linkedContractAddressColumn = 'linked_contract_address'
const linkedContractNetworkColumn = 'linked_contract_network'
const linkedContractUniqueConstraintName = 'linkedContract_linkedNetwork_unique'
const unlinkContractTriggerName =
  'prevent_null_update_if_previous_not_null_trigger'
const unlinkContractFunctionName = 'prevent_null_update_if_previous_not_null'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(Collection.tableName, {
    [linkedContractAddressColumn]: { type: 'string', notNull: false },
    [linkedContractNetworkColumn]: { type: 'string', notNull: false },
  })
  pgm.addConstraint(Collection.tableName, linkedContractUniqueConstraintName, {
    unique: [linkedContractAddressColumn, linkedContractNetworkColumn],
  })
  // Create the trigger function
  pgm.createFunction(
    unlinkContractFunctionName,
    [],
    {
      returns: 'TRIGGER',
      language: 'plpgsql',
    },
    `
    BEGIN
      IF (OLD.${linkedContractAddressColumn} IS NOT NULL AND NEW.${linkedContractAddressColumn} IS NULL) OR
         (OLD.${linkedContractNetworkColumn} IS NOT NULL AND NEW.${linkedContractNetworkColumn} IS NULL) THEN
        RAISE EXCEPTION 'Columns ${linkedContractAddressColumn}, ${linkedContractNetworkColumn} cannot be set to null if they were previously not null';
      END IF;
      RETURN NEW;
    END;
    `
  )
  // Attach the trigger to the table
  pgm.createTrigger(Collection.tableName, unlinkContractTriggerName, {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: unlinkContractFunctionName,
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(Collection.tableName, linkedContractUniqueConstraintName)
  pgm.dropColumn(Collection.tableName, [
    linkedContractAddressColumn,
    linkedContractNetworkColumn,
  ])
  pgm.dropTrigger(Collection.tableName, unlinkContractTriggerName)
  pgm.dropFunction(unlinkContractFunctionName, [])
}
