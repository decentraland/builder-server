import { Model, raw, SQL } from 'decentraland-server'
import { Item } from '../../Item'
import { CurationStatus, CurationType } from '../Curation.types'
import { CollectionCurationAttributes } from './CollectionCuration.types'

/** A collection approved on chain and when the chain last reviewed it. */
export type OnChainApproval = {
  contractAddress: string
  reviewedAt: Date
}

export class CollectionCuration extends Model<CollectionCurationAttributes> {
  static tableName = 'collection_curations'
  static type = CurationType.COLLECTION

  /**
   * The latest request of every collection, as a table aliased `collection_curations`. A pending request
   * older than the collection's on-chain approval was superseded by it (the legacy builder approves on chain
   * without closing the request it was reviewing), so it reads as approved. The columns are spelled out
   * because `status` is replaced: keep them in sync with the table.
   */
  static getLatestStatement(approvals: OnChainApproval[]) {
    if (!approvals.length) {
      return SQL`(SELECT DISTINCT ON (cc.collection_id) cc.* FROM ${raw(
        CollectionCuration.tableName
      )} cc ORDER BY cc.collection_id, cc.created_at DESC) collection_curations`
    }
    const addresses = approvals.map((approval) => approval.contractAddress)
    const reviewedAts = approvals.map((approval) => approval.reviewedAt)
    // created_at is a timestamp without time zone written in UTC, so the approval is read in UTC too.
    return SQL`(
      SELECT DISTINCT ON (cc.collection_id)
        cc.id, cc.collection_id, cc.assignee, cc.created_at, cc.updated_at,
        CASE WHEN cc.status = ${CurationStatus.PENDING}
          AND cc.created_at < (approvals.reviewed_at AT TIME ZONE 'UTC')
          THEN ${
            CurationStatus.APPROVED
          }::curation_status ELSE cc.status END AS status
      FROM ${raw(CollectionCuration.tableName)} cc
      JOIN collections ON collections.id = cc.collection_id
      LEFT JOIN unnest(${addresses}::text[], ${reviewedAts}::timestamptz[]) approvals(contract_address, reviewed_at)
        ON approvals.contract_address = collections.contract_address
      ORDER BY cc.collection_id, cc.created_at DESC
    ) collection_curations`
  }

  static async updateByItemId(itemId: string): Promise<{ rowCount: number }> {
    const columns = await this.query(SQL`
      UPDATE ${raw(CollectionCuration.tableName)} as collection_curations
      SET updated_at = ${new Date()}
      FROM ${raw(Item.tableName)} as items
      WHERE collection_curations.collection_id = items.collection_id
        AND items.id = ${itemId}`)

    return columns.length > 0 ? columns[0].rowCount : 0
  }
}
