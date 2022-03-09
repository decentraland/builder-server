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
    status: {
      type: 'string',
      enum: [
        CurationStatus.PENDING,
        CurationStatus.APPROVED,
        CurationStatus.REJECTED,
      ],
    },
  },
  additionalProperties: false,
  required: ['status'],
})
