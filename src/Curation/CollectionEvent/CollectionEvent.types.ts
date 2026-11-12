export enum CollectionEventType {
  COLLECTION_PUBLISHED = 'collection.published',
  REVIEW_HUMAN_REQUIRED = 'review.human_required',
  REVIEW_AUTOMATED_STARTED = 'review.automated_started',
  REVIEW_AUTOMATED_PASSED = 'review.automated_passed',
  REVIEW_AUTOMATED_REJECTED = 'review.automated_rejected',
  REVIEW_AUTOMATED_ERROR = 'review.automated_error',
  REVIEW_APPEAL_REQUESTED = 'review.appeal_requested',
  REVIEW_ASSIGNED = 'review.assigned',
  REVIEW_APPROVED = 'review.approved',
  REVIEW_REJECTED = 'review.rejected',
  CHANGES_SUBMITTED = 'changes.submitted',
}

export const HUMAN_DECISION_EVENT_TYPES: CollectionEventType[] = [
  CollectionEventType.REVIEW_APPROVED,
  CollectionEventType.REVIEW_REJECTED,
]

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
