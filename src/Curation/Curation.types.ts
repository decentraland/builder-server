export type CurationAttributes = {
  id: string
  collection_id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: Date
  updated_at: Date
}
