export type RedirectionData = {
  landURL: string
  msg1: string
  msg2: string
}

export const uploadRedirectionSchema = Object.freeze({
  type: 'object',
  properties: {
    data: {
      type: 'object',
      properties: {
        landURL: { type: 'string' },
        msg1: { type: 'string' },
        msg2: { type: 'string' },
      },
      additionalProperties: false,
      required: ['landURL', 'msg1', 'msg2'],
    },
  },
  additionalProperties: false,
  required: ['data'],
})
