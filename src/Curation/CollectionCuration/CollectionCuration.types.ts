import { CurationStatus, RejectionReason } from '../Curation.types'

export type CollectionCurationAttributes = {
  id: string
  collection_id: string
  assignee: string | null
  status: CurationStatus
  reviewed_by: string | null
  rejection_reasons: RejectionReason[] | null
  rejection_message: string | null
  created_at: Date
  updated_at: Date
}
