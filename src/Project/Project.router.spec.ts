import supertest from 'supertest'
import { buildURL, createAuthHeaders } from '../../spec/utils'
import { SearchableModel } from '../Searchable/SearchableModel'
import { SearchableProject } from './SearchableProject'
import { app } from '../server'
import { TemplateStatus } from './Project.types'

const server = supertest(app.getApp())

const aProject = {
  id: 'aProjectId',
  is_template: false,
}

const aTemplate = {
  id: 'aTemplateId',
  is_template: true,
  video: 'aTemplateVideo',
  template_status: TemplateStatus.AVAILABLE,
}

const mockEmptyResult = {
  items: [],
  total: 0,
}

describe('Project Router', () => {
  let url = ''

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

      afterEach(() => {
        jest.resetAllMocks()
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

      afterEach(() => {
        jest.resetAllMocks()
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
  
      afterEach(() => {
        jest.resetAllMocks()
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
  
      afterEach(() => {
        jest.resetAllMocks()
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
})
