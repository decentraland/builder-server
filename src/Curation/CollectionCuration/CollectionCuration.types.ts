import { CurationStatus } from '../Curation.types'

export type CollectionCurationAttributes = {
  id: string
  collection_id: string
  status: CurationStatus
  created_at: Date
  updated_at: Date
}
