import { CurationStatus } from '../Curation.types'

export type CollectionCurationAttributes = {
  id: string
  collection_id: string
  assignee: string | null
  status: CurationStatus
  created_at: Date
  updated_at: Date
}
