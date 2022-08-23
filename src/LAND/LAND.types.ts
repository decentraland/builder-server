export type Redirection = {
  landURL: string
  i18nCouldNotRedirectMsg: string
  i18nClickHereMsg: string
}

export type UploadRedirectionResponse = Redirection & { ipfsHash: string }
export type GetEIP1557ContentHashResponse = (Redirection & {
  eip1557ContentHash: string
})[]

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

export const getEIP1557ContentHashSchema = Object.freeze({
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
