import { buildEntityMetadata } from '../Item/hashes'

export const MAX_VALIDATION_ATTEMPTS_PER_DAY = 3
// The validator job drops a request with more items without answering.
export const MAX_VALIDATION_ITEMS = 50

export type ValidationTrigger = 'publish' | 'retry' | 'changes' | 'sweep'

export type ValidationVerdict = 'passed' | 'rejected' | 'error'

export type EntityMetadata = ReturnType<typeof buildEntityMetadata>

export type ValidationManifestItem = {
  itemId: string
  contentHash: string
  metadata: EntityMetadata
  contents: Record<string, string>
}

export type ValidationManifest = {
  validationId: string
  collectionId: string
  items: ValidationManifestItem[]
}

export type ValidationFinding = {
  rule: string
  check: string
  severity: 'error' | 'warning'
  message: string
  where?: string
  bodyShape?: 'male' | 'female'
  measured?: number
  limit?: number
  fix?: string
  docs?: string
}

export type ValidationResultItem = {
  itemId: string
  contentHash: string
  passed: boolean | null
  findings: ValidationFinding[]
  visualSummary?: string
  unsupported?: boolean
  error?: string
}

export type ValidationResult = {
  validationId: string
  collectionId: string
  verdict: ValidationVerdict
  rulesVersion: string
  items: ValidationResultItem[]
  // Only with verdict "error": "unsupported" means every undecided item is one the validator cannot judge.
  reason?: string
  // Only with verdict "error": whether sending the collection again may decide it.
  retryable?: boolean
}

export const UNSUPPORTED_VALIDATION_REASON = 'unsupported'

export type CollectionEventsPage<T> = {
  results: T[]
  total: number
  page: number
  limit: number
}

// Generous bounds: the body is signed by the validator, and a 400 makes SQS re-run the whole collection.
const shortText = { type: 'string', maxLength: 256 }
const longText = { type: 'string', maxLength: 10000 }

export const validationResultSchema = Object.freeze({
  type: 'object',
  properties: {
    validationId: { type: 'string', minLength: 1, maxLength: 64 },
    collectionId: { type: 'string', minLength: 1, maxLength: 64 },
    verdict: { type: 'string', enum: ['passed', 'rejected', 'error'] },
    reason: shortText,
    retryable: { type: 'boolean' },
    rulesVersion: shortText,
    items: {
      type: 'array',
      maxItems: MAX_VALIDATION_ITEMS,
      items: {
        type: 'object',
        properties: {
          itemId: shortText,
          contentHash: shortText,
          passed: { type: ['boolean', 'null'] },
          findings: {
            type: 'array',
            maxItems: 1000,
            items: {
              type: 'object',
              properties: {
                rule: shortText,
                check: shortText,
                severity: { type: 'string', enum: ['error', 'warning'] },
                message: longText,
                where: { type: 'string', maxLength: 1024 },
                bodyShape: { type: 'string', enum: ['male', 'female'] },
                measured: { type: 'number' },
                limit: { type: 'number' },
                fix: longText,
                docs: { type: 'string', maxLength: 2048 },
              },
              required: ['rule', 'check', 'severity', 'message'],
            },
          },
          visualSummary: { type: 'string', maxLength: 50000 },
          unsupported: { type: 'boolean' },
          error: longText,
        },
        required: ['itemId', 'contentHash', 'passed', 'findings'],
      },
    },
  },
  required: [
    'validationId',
    'collectionId',
    'verdict',
    'rulesVersion',
    'items',
  ],
  additionalProperties: false,
})

export const appealSchema = Object.freeze({
  type: 'object',
  properties: {
    note: { type: 'string', minLength: 1, maxLength: 2000 },
  },
  required: ['note'],
  additionalProperties: false,
})
