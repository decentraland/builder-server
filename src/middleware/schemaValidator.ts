import { Schema } from 'ajv'
import express from 'express'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'

const validator = getValidator()

export const withSchemaValidation = (schema: Schema) => (
  req: express.Request,
  _: express.Response,
  next: express.NextFunction
) => {
  const validate = validator.compile(schema)
  const valid = validate(req.body)

  if (!valid) {
    next(
      new HTTPError(
        'Invalid request body',
        validate.errors,
        STATUS_CODES.badRequest
      )
    )
  }
  next()
}
