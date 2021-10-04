import supertest from 'supertest'
import express from 'express'
import { buildURL } from '../../spec/utils'
import { app } from '../server'
import { HTTPError } from './HTTPError'
import { asyncHandler } from './asyncHandler'

const errorMessage = 'anErrorMessage'
const errorStatusCode = 400
const errorData = { id: 'anId' }

const handlerWithHttpError = () => {
  throw new HTTPError(errorMessage, errorData, errorStatusCode)
}
const handlerWithCommonError = () => {
  throw new Error(errorMessage)
}
const handlerWithSentHeadersAndCommonError = (
  _: express.Request,
  res: express.Response
) => {
  res.sendStatus(401)
  throw new Error(errorMessage)
}

const asyncHandlerWithHttpError = async () => handlerWithHttpError()
const asyncHandlerWithError = async () => handlerWithCommonError()

app.getRouter().get('/syncHttpError', handlerWithHttpError)
app.getRouter().get('/asyncHttpError', asyncHandler(asyncHandlerWithHttpError))
app.getRouter().get('/syncError', handlerWithCommonError)
app.getRouter().get('/asyncError', asyncHandler(asyncHandlerWithError))
app
  .getRouter()
  .get('/syncErrorWithSentHeaders', handlerWithSentHeadersAndCommonError)

const server = supertest(app.getApp())

describe('when handling an error when the headers have already been sent', () => {
  it('should respond with the set status code and the default express error handler', () => {
    return server
      .get(buildURL('/syncErrorWithSentHeaders'))
      .expect(401)
      .expect('Content-Type', 'text/plain; charset=utf-8')
      .then(() => undefined)
  })
})

describe('when handling async http errors', () => {
  it('should respond with the thrown error status code, the message and the data', () => {
    return server
      .get(buildURL('/asyncHttpError'))
      .expect(errorStatusCode)
      .then((response: any) => {
        expect(response.body).toEqual({
          error: errorMessage,
          data: errorData,
          ok: false,
        })
      })
  })
})

describe('when handling async errors', () => {
  it('should respond with the a 500 an the error message', () => {
    return server
      .get(buildURL('/asyncError'))
      .expect(500)
      .then((response: any) => {
        expect(response.body).toEqual({
          error: errorMessage,
          data: {},
          ok: false,
        })
      })
  })
})

describe('when handling sync http errors', () => {
  it('should respond with the a 500 an the error message', () => {
    return server
      .get(buildURL('/syncHttpError'))
      .expect(errorStatusCode)
      .then((response: any) => {
        expect(response.body).toEqual({
          error: errorMessage,
          data: errorData,
          ok: false,
        })
      })
  })
})

describe('when handling sync errors', () => {
  it('should respond with the a 500 an the error message', () => {
    return server
      .get(buildURL('/syncError'))
      .expect(500)
      .then((response: any) => {
        expect(response.body).toEqual({
          error: errorMessage,
          data: {},
          ok: false,
        })
      })
  })
})
