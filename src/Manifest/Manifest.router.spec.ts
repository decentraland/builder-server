import supertest from 'supertest'
import { v4 as uuid } from 'uuid'
import { buildURL, createAuthHeaders } from '../../spec/utils'
import { app } from '../server'
import { Project } from '../Project/Project.model'
import { TemplateStatus } from '../Project/Project.types'

const server = supertest(app.getApp())

const aTemplate = {
  id: uuid(),
  is_template: true,
  video: 'aTemplateVideo',
  template_status: TemplateStatus.ACTIVE,
}

jest.mock('../Project/Project.model')

describe('Manifest Router', () => {
  let url = ''

  describe('when getting the manifest of a template', () => {
    describe('and the template exists and is active', () => {
      beforeEach(() => {
        url = `/templates/${aTemplate.id}/manifest`
        ;(Project.count as jest.Mock).mockResolvedValueOnce(1)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should return a http response code: 301', async () => {
        await server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(301)

        expect(Project.count).toBeCalledTimes(1)
      })
    })

    describe('and the template does not exists or is not active', () => {
      beforeEach(() => {
        url = `/templates/${aTemplate.id}/manifest`
        ;(Project.count as jest.Mock).mockResolvedValueOnce(0)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should return a http response code: 404', async () => {
        await server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(404)

        expect(Project.count).toBeCalledTimes(1)
      })
    })
  })

  describe('when getting the manifest of a public project', () => {
    beforeEach(() => {
      url = `/publics/${uuid()}/manifest`
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the project is public', () => {
      beforeEach(() => {
        ;(Project.count as jest.Mock).mockResolvedValueOnce(1)
      })

      it('should redirect to the manifest with a 301', async () => {
        await server.get(buildURL(url)).expect(301)
      })
    })

    describe('and the project exists but is private', () => {
      beforeEach(() => {
        ;(Project.count as jest.Mock).mockImplementationOnce(
          async (conditions: Record<string, unknown>) =>
            conditions.is_public === true ? 0 : 1
        )
      })

      it('should respond with a 404 without redirecting to the manifest', async () => {
        await server.get(buildURL(url)).expect(404)
      })
    })
  })
})
