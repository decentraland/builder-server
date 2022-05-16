export enum CurationType {
  COLLECTION = 'collection',
  ITEM = 'item',
}

export enum CurationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum CurationStatusFilter {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  TO_REVIEW = 'to_review',
  UNDER_REVIEW = 'under_review',
}

export enum CurationStatusSort {
  MOST_RELEVANT = 'MOST_RELEVANT',
  NEWEST = 'NEWEST',
  NAME_DESC = 'NAME_DESC',
  NAME_ASC = 'NAME_ASC',
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
    assignee: { type: ['string', 'null'] },
  },
  additionalProperties: false,
  anyOf: [{ required: ['assignee'] }, { required: ['status'] }],
})
