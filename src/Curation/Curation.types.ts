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
  DISABLED = 'disabled',
  /** The automated review is running; left out of the other pending filters until it ends. */
  AUTO_REVIEWING = 'auto_reviewing',
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

/** `assignee` filter value for the collections without an assigned curator. */
export const UNASSIGNED_FILTER = 'unassigned'

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
    rejectionMessage: { type: 'string', minLength: 1, maxLength: 3000 },
    note: { type: 'string', maxLength: 2000 },
  },
  additionalProperties: false,
  anyOf: [{ required: ['assignee'] }, { required: ['status'] }],
})

// Open to other properties: the legacy Builder's body was never validated.
export const postCurationSchema = Object.freeze({
  type: 'object',
  properties: {
    note: { type: 'string', maxLength: 2000 },
  },
})
