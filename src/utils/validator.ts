import Ajv from 'ajv'
import addFormats from 'ajv-formats'

export function getValidator() {
  const ajv = new Ajv({ removeAdditional: true, discriminator: true })
  addFormats(ajv)
  return ajv
}
