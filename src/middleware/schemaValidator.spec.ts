import supertest from 'supertest'
import express from 'express'
import { Schema } from 'ajv'
import { buildURL } from '../../spec/utils'
import { app } from '../server'
import { withSchemaValidation } from './schemaValidator'

const schema: Schema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
  additionalProperties: false,
  required: ['id'],
})

const simpleResponseHandler = (_: express.Request, res: express.Response) => {
  res.status(200).end()
}

app
  .getRouter()
  .post('/test', withSchemaValidation(schema), simpleResponseHandler)
const server = supertest(app.getApp())

let data: any
describe('when posting invalid data', () => {
  beforeEach(() => {
    data = { id: 234 }
  })

  it('should respond with a 400 and a detailed description of the validation errors', () => {
    return server
      .post(buildURL('/test'))
      .send(data)
      .expect(400)
      .then((response) => {
        expect(response.body).toEqual({
          error: 'Invalid request body',
          data: [
            {
              dataPath: '/id',
              keyword: 'type',
              message: 'should be string',
              params: { type: 'string' },
              schemaPath: '#/properties/id/type',
            },
          ],
          ok: false,
        })
      })
  })
})

describe('when posting no data', () => {
  it('should respond with a 400 and a detailed description of the validation errors', () => {
    return server
      .post(buildURL('/test'))
      .expect(400)
      .then((response) => {
        expect(response.body).toEqual({
          error: 'Invalid request body',
          data: [
            {
              dataPath: '',
              keyword: 'required',
              message: "should have required property 'id'",
              params: { missingProperty: 'id' },
              schemaPath: '#/required',
            },
          ],
          ok: false,
        })
      })
  })
})

describe('when posting the correct data', () => {
  beforeEach(() => {
    data = { id: 'anId' }
  })

  it("should respond with the handler's response", () => {
    return server
      .post(buildURL('/test'))
      .send(data)
      .expect(200)
      .then(() => undefined)
  })
})
