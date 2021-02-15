import { AssetParameter, parametersSchema } from '../Parameters'

export type AssetAction = {
  id: string
  label: string
  parameters: AssetParameter[]
}

export type ActionAttributes = AssetAction[]

export const actionsSchema = Object.freeze({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      label: { type: 'string' },
      description: { type: 'string' },
      parameters: parametersSchema,
    },
    additionalProperties: false,
    required: ['id', 'label', 'parameters'],
  },
})
