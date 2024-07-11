import Ajv from 'ajv'
import { RangeMapping } from '@dcl/schemas'
import addFormats from 'ajv-formats'

export function getValidator() {
  const ajv = new Ajv({
    removeAdditional: true,
    discriminator: true,
  })
  ajv.addKeyword('_fromLessThanOrEqualTo', RangeMapping._fromLessThanOrEqualTo)
  addFormats(ajv)
  return ajv
}
