export type Redirection = {
  landURL: string
  i18nCouldNotRedirectMsg: string
  i18nClickHereMsg: string
}

export type RedirectionWithHashes = Redirection & {
  ipfsHash: string
  contentHash: string
}

export type UploadRedirectionResponse = RedirectionWithHashes

export type GetRedirectionHashesResponse = RedirectionWithHashes[]

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

export const getRedirectionHashesSchema = Object.freeze({
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
