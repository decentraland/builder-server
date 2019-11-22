export type AuthorDetailAttributes = {
  ethAddress?: string
}

export const authorDetailSchema = {
  type: 'object',
  properties: {
    ethAddress: {
      type: 'string',
      format: /^0x[a-fA-F0-9]{40}$/gi
    }
  }
}
