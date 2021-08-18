import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
const ethereumRegex = /^0x[a-fA-F0-9]{40}$/

export function getValidator() {
  const ajv = new Ajv({ removeAdditional: true })
  addFormats(ajv)
  ajv
    .addFormat('custom-email', {
      type: 'string',
      validate: (x: string) => emailRegex.test(x),
    })
    .addFormat('address', {
      type: 'string',
      validate: (x: string) => ethereumRegex.test(x),
    })
  return ajv
}
