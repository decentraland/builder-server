export enum CurationType {
  COLLECTION = 'collection',
  ITEM = 'item',
}

export enum CurationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const patchCurationSchema = Object.freeze({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['approved', 'rejected'] },
  },
  additionalProperties: false,
  required: ['status'],
})
