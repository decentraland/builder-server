export type AssetParameter = {
  id: string
  type: AssetParameterType
  label: string
  default?: any
  options?: string[]
}

export enum AssetParameterType {
  BOOLEAN = 'boolean',
  STRING = 'string',
  FLOAT = 'float',
  INTEGER = 'integer',
  ENUM = 'enum',
  ENTITY = 'entity'
}

export type ParametersAttributes = AssetParameterType[]

export const parametersSchema = Object.freeze({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: {
        enum: ['boolean', 'string', 'float', 'integer', 'enum', 'entity']
      },
      label: { type: 'string' },
      default: {
        oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }]
      },
      options: {
        type: 'array',
        items: {
          type: 'string'
        }
      }
    },
    additionalProperties: false,
    removeAdditional: true,
    required: ['id', 'type', 'label']
  }
})
