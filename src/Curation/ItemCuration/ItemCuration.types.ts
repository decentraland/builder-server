import { CurationStatus } from '../Curation.types'

export type ItemCurationAttributes = {
  id: string
  item_id: string
  content_hash: string
  status: CurationStatus
  created_at: Date
  updated_at: Date
  is_mapping_complete: boolean | null
}

export type ItemCurationWithTotalCount = ItemCurationAttributes & {
  total_count: number
}
