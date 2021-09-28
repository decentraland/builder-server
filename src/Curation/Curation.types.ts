export type CurationAttributes = {
  id: string
  collection_id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: Date
  updated_at: Date
}

export const patchCurationSchema = Object.freeze({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['approved', 'rejected'] },
  },
  additionalProperties: false,
  required: ['status'],
})
