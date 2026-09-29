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

export const REJECTION_REASONS = [
  'clipping',
  'thumbnail',
  'category_hides',
  'rigging',
  'triangle_count',
  'emote',
  'file_size',
  'textures_materials',
  'reversed_faces',
  'smart_wearable_files',
  'content_policy_ip',
  'other',
] as const

export type RejectionReason = typeof REJECTION_REASONS[number]

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
    rejectionReasons: {
      type: 'array',
      items: { type: 'string', enum: [...REJECTION_REASONS] },
      minItems: 1,
      uniqueItems: true,
    },
    rejectionMessage: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
  anyOf: [{ required: ['assignee'] }, { required: ['status'] }],
})
