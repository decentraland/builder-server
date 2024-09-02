/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const linkedContractAddressColumn = 'linked_contract_address'
const linkedContractNetworkColumn = 'linked_contract_network'
const thirdPartyId = 'third_party_id'
const oldLinkedContractUniqueConstraintName =
  'linkedContract_linkedNetwork_unique'
const newLinkedContractUniqueConstraintName =
  'linkedContract_linkedNetwork_thirdPartyId_unique'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(
    Collection.tableName,
    oldLinkedContractUniqueConstraintName
  )
  pgm.addConstraint(
    Collection.tableName,
    newLinkedContractUniqueConstraintName,
    {
      unique: [
        thirdPartyId,
        linkedContractAddressColumn,
        linkedContractNetworkColumn,
      ],
    }
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(
    Collection.tableName,
    newLinkedContractUniqueConstraintName
  )
  pgm.addConstraint(
    Collection.tableName,
    oldLinkedContractUniqueConstraintName,
    {
      unique: [linkedContractAddressColumn, linkedContractNetworkColumn],
    }
  )
}
