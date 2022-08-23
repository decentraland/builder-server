export type Redirection = {
  landURL: string
  i18nCouldNotRedirectMsg: string
  i18nClickHereMsg: string
}

export type RedirectionWithContentHash = Redirection & {
  contentHash: string
}

export type UploadRedirectionResponse = RedirectionWithContentHash

export type GetRedirectionContentHashResponse = RedirectionWithContentHash[]

const redirectionSchema = Object.freeze({
  type: 'object',
  properties: {
    landURL: {
      type: 'string',
    },
    i18nCouldNotRedirectMsg: {
      type: 'string',
    },
    i18nClickHereMsg: {
      type: 'string',
    },
  },
  additionalProperties: false,
  required: ['landURL', 'i18nCouldNotRedirectMsg', 'i18nClickHereMsg'],
})

export const uploadRedirectionSchema = Object.freeze({
  type: 'object',
  properties: {
    redirection: redirectionSchema,
  },
  additionalProperties: false,
  required: ['redirection'],
})

export const getRedirectionContentHashSchema = Object.freeze({
  type: 'object',
  properties: {
    redirections: {
      type: 'array',
      items: redirectionSchema,
    },
  },
  additionalProperties: false,
  required: ['redirections'],
})
