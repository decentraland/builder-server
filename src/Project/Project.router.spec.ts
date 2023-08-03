import supertest from 'supertest'
import { ContentMapping, Entity } from '@dcl/schemas'
import { buildURL, createAuthHeaders } from '../../spec/utils'
import { SearchableModel } from '../Searchable/SearchableModel'
import { app } from '../server'
import * as s3Module from '../S3'
import { ManifestAttributes } from '../Manifest'
import { SDK7Scene } from '../Scene/SDK7Scene'
import { COMPOSITE_FILE_HASH } from '../Scene/composite'
import { SearchableProject } from './SearchableProject'
import { TemplateStatus } from './Project.types'

jest.mock('../S3', () => {
  return {
    ...jest.requireActual('../S3'),
    getProjectManifest: jest.fn()
  }
})

jest.mock('../middleware', () => {
  return {
    ...jest.requireActual('../middleware'),
    withModelExists: jest.fn().mockImplementation(() => jest.fn((_req, _res, next) => next()))
  }
})

const server = supertest(app.getApp())

const aProject = {
  id: 'aProjectId',
  is_template: false,
}

const aTemplate = {
  id: 'aTemplateId',
  is_template: true,
  video: 'aTemplateVideo',
  template_status: TemplateStatus.ACTIVE,
}

const mockEmptyResult = {
  items: [],
  total: 0,
}

describe('Project Router', () => {
  let url = ''

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when getting the projects of a user', () => {
    let mockResult: any
    describe('and the user has projects', () => {
      beforeEach(() => {
        url = '/projects/'
        mockResult = {
          items: [aProject],
          total: 1,
        }
        jest.spyOn(SearchableProject.prototype, 'searchByEthAddress')
        jest
          .spyOn(SearchableModel.prototype, 'search')
          .mockResolvedValueOnce(mockResult)
      })

      it('should return the projects', async () => {
        const response = await server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)

        expect(response.body).toEqual({
          data: mockResult,
          ok: true,
        })

        expect(SearchableProject.prototype.searchByEthAddress).toBeCalledTimes(
          1
        )
      })
    })

    describe('and the user has no projects', () => {
      beforeEach(() => {
        jest.spyOn(SearchableProject.prototype, 'searchByEthAddress')
        jest
          .spyOn(SearchableModel.prototype, 'search')
          .mockResolvedValueOnce(mockEmptyResult)
      })

      it('should return an empty array', async () => {
        const response = await server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)

        expect(response.body).toEqual({
          data: mockEmptyResult,
          ok: true,
        })
        expect(SearchableProject.prototype.searchByEthAddress).toBeCalledTimes(
          1
        )
      })
    })
  })

  describe('when getting the scene templates', () => {
    let mockResult: any
  
    beforeEach(() => {
      url = '/templates'
    })
  
    describe('and there are templates created', () => {
      beforeEach(() => {
        mockResult = {
          items: [aTemplate],
          total: 1,
        }
        jest.spyOn(SearchableProject.prototype, 'searchByIsTemplate')
        jest
          .spyOn(SearchableModel.prototype, 'search')
          .mockResolvedValueOnce(mockResult)
      })
  
      it('should return the templates', async () => {
        const response = await server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
  
        expect(response.body).toEqual({
          data: mockResult,
          ok: true,
        })
        expect(SearchableProject.prototype.searchByIsTemplate).toBeCalledTimes(
          1
        )
      })
    })
  
    describe('and there are not templates created', () => {
      beforeEach(() => {
        jest
          .spyOn(SearchableModel.prototype, 'search')
          .mockResolvedValueOnce(mockEmptyResult)
      })
  
      it('should return an empty array', async () => {
        const response = await server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
  
        expect(response.body).toEqual({
          data: mockEmptyResult,
          ok: true,
        })
        expect(SearchableProject.prototype.searchByIsTemplate).toBeCalledTimes(
          1
        )
      })
    })
  })

  describe('when getting scene contents', () => {
    const projectId = 'project-id'

    describe('and getting project preview', () => {
      describe('and project scene is in sdk6', () => {
        beforeEach(() => {
          (s3Module.getProjectManifest as jest.Mock).mockResolvedValueOnce({
            version: 1,
            project: {},
            scene: { sdk6: { id: 'scene-id' }, sdk7: null }
          } as unknown as ManifestAttributes)
        })
    
        it('should return error', async () => {
          return await server
            .get(buildURL(`/projects/${projectId}/contents/preview`))
            .expect(400)
        })
      })

      describe('and project scene is in sdk7', () => {
        const entity = { id: 'entity-id', content: [] as ContentMapping[] }
        beforeEach(() => {
          (s3Module.getProjectManifest as jest.Mock).mockResolvedValueOnce({
            version: 1,
            project: {},
            scene: { sdk6: null, sdk7: { id: 'scene-id' } }
          } as unknown as ManifestAttributes)
          jest.spyOn(SDK7Scene.prototype, 'getEntity').mockResolvedValueOnce(entity as Entity)
        })

        it('should return entity object', async () => {
          const response = await server
            .get(buildURL(`/projects/${projectId}/contents/preview`))
            .expect(200)
          expect(response.body).toEqual(entity)
        })
      })
    })

    describe('and getting scene composite', () => {
      describe('and project scene is in sdk6', () => {
        beforeEach(() => {
          (s3Module.getProjectManifest as jest.Mock).mockResolvedValueOnce({
            version: 1,
            project: {},
            scene: { sdk6: { id: 'scene-id' }, sdk7: null }
          } as unknown as ManifestAttributes)
        })
    
        it('should return error', async () => {
          return await server
            .get(buildURL(`/projects/${projectId}/contents/${COMPOSITE_FILE_HASH}`))
            .expect(400)
        })
      })

      describe('and project scene is in sdk7', () => {
        const composite = { components: [] }
        beforeEach(() => {
          (s3Module.getProjectManifest as jest.Mock).mockResolvedValueOnce({
            version: 1,
            project: {},
            scene: { sdk6: null, sdk7: { id: 'scene-id', composite } }
          } as unknown as ManifestAttributes)
        })

        it('should return composite definition', async () => {
          const response = await server
            .get(buildURL(`/projects/${projectId}/contents/${COMPOSITE_FILE_HASH}`))
            .expect(200)
          expect(response.body).toEqual(composite)
        })
      })
    })

    describe('and getting file hash', () => {
      it('should redirect to s3 bucket', async () => {
        return await server
          .get(buildURL(`/projects/${projectId}/contents/some-hash`))
          .expect(301)
      })
    })
  })
})
