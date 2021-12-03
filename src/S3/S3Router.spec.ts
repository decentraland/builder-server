import supertest from 'supertest'
import { buildURL, createAuthHeaders } from '../../spec/utils'
import { app } from '../server'
import { getBucketURL } from './s3'

const server = supertest(app.getApp())

describe('S3 router', () => {
  let fileName: string
  let url: string

  beforeEach(() => {
    fileName = 'aFile'
  })

  describe('when getting the contents of a file', () => {
    beforeEach(() => {
      url = `/storage/contents/${fileName}`
    })

    it('should respond with a cached 301 redirecting to the S3 file', async () => {
      await server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect('Location', `${getBucketURL()}/contents/${fileName}`)
        .expect('Cache-Control', 'public,max-age=31536000,immutable')
        .expect(301)
    })
  })

  describe('when getting the information of a file', () => {
    beforeEach(() => {
      url = `/storage/contents/${fileName}`
    })

    it('should respond with a cached 301 redirecting to the S3 file', async () => {
      await server
        .get(buildURL(url))
        .set(createAuthHeaders('head', url))
        .expect('Location', `${getBucketURL()}/contents/${fileName}`)
        .expect('Cache-Control', 'public,max-age=31536000,immutable')
        .expect(301)
    })
  })
})
