import Ajv from 'ajv'
import addFormats from 'ajv-formats'

export function getValidator() {
  const ajv = new Ajv({ removeAdditional: true })
  addFormats(ajv)
  return ajv
}
