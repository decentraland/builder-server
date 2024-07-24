import Ajv from 'ajv'
import { Mappings, RangeMapping } from '@dcl/schemas'
import addFormats from 'ajv-formats'

export function getValidator() {
  const ajv = new Ajv({
    removeAdditional: true,
    discriminator: true,
  })
  ajv
    .addKeyword({
      ...RangeMapping._fromLessThanOrEqualTo,
      keyword: '_fromLessThanOrEqualTo',
    })
    .addKeyword({ ...Mappings._isMappingsValid, keyword: '_isMappingsValid' })
  addFormats(ajv)
  return ajv
}
