export enum CollectionEventType {
  COLLECTION_PUBLISHED = 'collection.published',
  REVIEW_HUMAN_REQUIRED = 'review.human_required',
  REVIEW_AI_STARTED = 'review.ai_started',
  REVIEW_AI_PASSED = 'review.ai_passed',
  REVIEW_AI_REJECTED = 'review.ai_rejected',
  REVIEW_AI_ERROR = 'review.ai_error',
  REVIEW_APPEAL_REQUESTED = 'review.appeal_requested',
  REVIEW_ASSIGNED = 'review.assigned',
  REVIEW_APPROVED = 'review.approved',
  REVIEW_REJECTED = 'review.rejected',
  CHANGES_SUBMITTED = 'changes.submitted',
  COLLECTION_DISABLED = 'collection.disabled',
}

export enum CollectionEventActor {
  CREATOR = 'creator',
  CURATOR = 'curator',
  VALIDATOR = 'validator',
  SYSTEM = 'system',
}

export type CollectionEventAttributes = {
  id: string
  collection_id: string
  type: CollectionEventType
  actor: CollectionEventActor
  actor_address: string | null
  payload: Record<string, unknown>
  created_at: Date
}

export type NewCollectionEvent = Omit<
  CollectionEventAttributes,
  'id' | 'created_at'
>

export type CollectionEventWithTotalCount = CollectionEventAttributes & {
  total_count: number
}
