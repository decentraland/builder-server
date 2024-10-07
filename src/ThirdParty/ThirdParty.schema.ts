import { JSONSchema } from '@dcl/schemas'
import { UpdateVirtualThirdPartyBody } from './ThirdParty.types'

export const UpdateVirtualThirdPartyBodySchema: JSONSchema<UpdateVirtualThirdPartyBody> = {
  type: 'object',
  properties: {
    isProgrammatic: {
      type: 'boolean',
      description: 'Defines if the third party is programmatic or not',
      nullable: false,
      minLength: 1,
    },
  },
  required: ['isProgrammatic'],
}
