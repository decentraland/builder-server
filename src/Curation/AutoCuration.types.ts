import { buildEntityMetadata } from '../Item/hashes'

export const MAX_VALIDATION_ATTEMPTS_PER_DAY = 3

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

export const validationResultSchema = Object.freeze({
  type: 'object',
  properties: {
    validationId: { type: 'string', minLength: 1 },
    collectionId: { type: 'string', minLength: 1 },
    verdict: { type: 'string', enum: ['passed', 'rejected', 'error'] },
    reason: { type: 'string' },
    retryable: { type: 'boolean' },
    rulesVersion: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          contentHash: { type: 'string' },
          passed: { type: ['boolean', 'null'] },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rule: { type: 'string' },
                check: { type: 'string' },
                severity: { type: 'string', enum: ['error', 'warning'] },
                message: { type: 'string' },
                where: { type: 'string' },
                bodyShape: { type: 'string', enum: ['male', 'female'] },
                measured: { type: 'number' },
                limit: { type: 'number' },
                fix: { type: 'string' },
                docs: { type: 'string' },
              },
              required: ['rule', 'check', 'severity', 'message'],
            },
          },
          visualSummary: { type: 'string' },
          unsupported: { type: 'boolean' },
          error: { type: 'string' },
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
