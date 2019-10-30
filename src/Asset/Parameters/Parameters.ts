import { ParametersAttributes } from './Parameters.types'

export class Parameters {
  attributes: ParametersAttributes | undefined

  constructor(attributes?: ParametersAttributes) {
    this.attributes = attributes
  }

  getAttributes(): ParametersAttributes {
    return []
  }
}
