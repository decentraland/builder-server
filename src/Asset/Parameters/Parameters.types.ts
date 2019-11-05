export type AssetParameter = {
  id: string
  type: AssetParameterType
  label: string
  default?: number | string | boolean
  options?: AssetParameterOption[]
}

export type AssetParameterOption = {
  label: string
  value: string
}

export enum AssetParameterType {
  BOOLEAN = 'boolean',
  STRING = 'string',
  FLOAT = 'float',
  INTEGER = 'integer',
  ENTITY = 'entity',
  ACTIONS = 'actions',
  OPTIONS = 'options'
}

export type ParametersAttributes = AssetParameterType[]

export const parametersSchema = Object.freeze({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: {
        enum: [
          'boolean',
          'string',
          'float',
          'integer',
          'options',
          'entity',
          'actions'
        ]
      },
      label: { type: 'string' },
      default: {
        oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }]
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string'
            },
            value: {
              type: 'string'
            }
          },
          additionalProperties: false,
          removeAdditional: true,
          required: ['label', 'value']
        }
      },
      description: {
        type: 'string'
      }
    },
    additionalProperties: false,
    removeAdditional: true,
    required: ['id', 'type', 'label']
  }
})
