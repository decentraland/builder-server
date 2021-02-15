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
  TEXT = 'text',
  FLOAT = 'float',
  INTEGER = 'integer',
  ENTITY = 'entity',
  ACTIONS = 'actions',
  OPTIONS = 'options',
  TEXTAREA = 'textarea',
  SLIDER = 'slider',
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
          'text',
          'float',
          'integer',
          'options',
          'entity',
          'actions',
          'textarea',
          'slider',
        ],
      },
      label: { type: 'string' },
      default: {
        oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
            },
            value: {
              type: 'string',
            },
          },
          additionalProperties: false,
          required: ['label', 'value'],
        },
      },
      min: {
        type: 'number',
      },
      max: {
        type: 'number',
      },
      step: {
        type: 'number',
      },
      description: {
        type: 'string',
      },
    },
    additionalProperties: false,
    required: ['id', 'type', 'label'],
  },
})
