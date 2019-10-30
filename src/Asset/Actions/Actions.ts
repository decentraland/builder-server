import { ActionAttributes } from './Action.types'

export class Actions {
  attributes: ActionAttributes | undefined

  constructor(attributes?: ActionAttributes) {
    this.attributes = attributes
  }

  getAttributes(): ActionAttributes {
    return []
  }
}
