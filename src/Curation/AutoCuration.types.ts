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
  severity: 'error' | 'warning'
  message: string
  where?: string
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
}

export type ValidationResult = {
  validationId: string
  verdict: ValidationVerdict
  items: ValidationResultItem[]
}

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
    verdict: { type: 'string', enum: ['passed', 'rejected', 'error'] },
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
                severity: { type: 'string', enum: ['error', 'warning'] },
                message: { type: 'string' },
              },
              required: ['rule', 'severity', 'message'],
            },
          },
          visualSummary: { type: 'string' },
        },
        required: ['itemId', 'contentHash', 'passed', 'findings'],
      },
    },
  },
  required: ['validationId', 'verdict', 'items'],
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
