import Ajv from 'ajv'
import { Mappings, RangeMapping } from '@dcl/schemas'
import addFormats from 'ajv-formats'
import addErrors from 'ajv-errors'

// Patch the mappings validator to accept mappings that are null
const mappingsValidator = (...args: any[]): Promise<any> | boolean =>
  args[1] && Mappings._isMappingsValid.validate
    ? Mappings._isMappingsValid.validate.apply(
        Mappings._isMappingsValid,
        args as any
      )
    : Promise.resolve(true)

export function getValidator() {
  const ajv = new Ajv({
    removeAdditional: true,
    discriminator: true,
    allErrors: true,
  })
  ajv
    .addKeyword({
      ...RangeMapping._fromLessThanOrEqualTo,
      keyword: '_fromLessThanOrEqualTo',
    })
    .addKeyword({ ...Mappings._isMappingsValid, validate: mappingsValidator })
  addFormats(ajv)
  addErrors(ajv)
  return ajv
}
