import supertest from 'supertest'
import { ExpressApp, RawBodyRequest } from './ExpressApp'

describe('when parsing a JSON body', () => {
  let app: ExpressApp
  let rawBodies: Record<string, string | undefined>

  beforeEach(() => {
    rawBodies = {}
    app = new ExpressApp().useJSON()
    for (const path of [
      '/collections/:id/validation-result',
      '/collections/:id/Validation-Result/',
      '/collections/:id/curation',
    ]) {
      app.getApp().post(path, (req, res) => {
        rawBodies[req.path] = (req as RawBodyRequest).rawBody
        res.status(204).end()
      })
    }
  })

  it('should keep the raw body only for the validator callback', async () => {
    const server = supertest(app.getApp())
    const body = '{"verdict": "passed" }'

    await server
      .post('/collections/1/validation-result')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(204)
    await server
      .post('/collections/1/Validation-Result/')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(204)
    await server
      .post('/collections/1/curation')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(204)

    expect(rawBodies).toEqual({
      '/collections/1/validation-result': body,
      '/collections/1/Validation-Result/': body,
      '/collections/1/curation': undefined,
    })
  })
})
