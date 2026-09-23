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
