import { CurationStatus } from '../Curation.types'

export type ItemCurationAttributes = {
  id: string
  item_id: string
  status: CurationStatus
  created_at: Date
  updated_at: Date
}
