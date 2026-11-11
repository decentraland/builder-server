import supertest from 'supertest'
import { v4 as uuid } from 'uuid'
import { QueryPart } from 'decentraland-server'
import {
  buildURL,
  createAuthHeaders,
  mockAuthorizationMiddleware,
} from '../../spec/utils'
import { wallet } from '../../spec/mocks/wallet'
import { app } from '../../src/server'
import { Project } from '../../src/Project/Project.model'
import { Deployment } from '../../src/Deployment/Deployment.model'
import { S3Project } from '../../src/S3/S3Project'

jest.mock('../../src/Project/Project.model')
jest.mock('../../src/Deployment/Deployment.model')

const server = supertest(app.getApp())
const anotherAddress = '0x0000000000000000000000000000000000000001'

function mockProjectExists(id: string) {
  ;(Project.count as jest.Mock).mockImplementationOnce(
    async (conditions: QueryPart) =>
      conditions['id'] === id && conditions['is_deleted'] === false ? 1 : 0
  )
}

describe('when deleting a project', () => {
  let id: string
  let url: string

  beforeEach(() => {
    id = uuid()
    url = `/projects/${id}`
    mockProjectExists(id)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the caller owns it', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Project, id, wallet.address)
    })

    it('should respond with a 200 and flag the project as deleted', async () => {
      await server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(200)

      expect(Project.update).toHaveBeenCalledWith(
        { updated_at: expect.any(Date), is_deleted: true },
        { id }
      )
    })
  })

  describe('and the caller does not own it', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Project, id, anotherAddress)
    })

    it('should respond with a 401 without deleting the project', async () => {
      await server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(401)

      expect(Project.update).not.toHaveBeenCalled()
    })
  })
})

describe('when deleting the manifest of a project', () => {
  let id: string
  let url: string
  let deleteFileSpy: jest.SpyInstance

  beforeEach(() => {
    id = uuid()
    url = `/projects/${id}/manifest`
    deleteFileSpy = jest
      .spyOn(S3Project.prototype, 'deleteFile')
      .mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    jest.resetAllMocks()
    deleteFileSpy.mockRestore()
  })

  describe('and the caller owns the project', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Project, id, wallet.address)
    })

    it('should respond with a 200 and delete the manifest file', async () => {
      await server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(200)

      expect(deleteFileSpy).toHaveBeenCalledWith('manifest.json')
    })
  })

  describe('and the caller does not own the project', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Project, id, anotherAddress)
    })

    it('should respond with a 401 without deleting the manifest file', async () => {
      await server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(401)

      expect(deleteFileSpy).not.toHaveBeenCalled()
    })
  })
})

describe('when deleting the deployment of a project', () => {
  let id: string
  let url: string

  beforeEach(() => {
    id = uuid()
    url = `/projects/${id}/deployment`
    mockProjectExists(id)
    mockAuthorizationMiddleware(Project, id, wallet.address)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the caller owns the deployment', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Deployment, id, wallet.address)
    })

    it('should respond with a 200 and delete the deployment scoped to the caller', async () => {
      await server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(200)

      expect(Deployment.delete).toHaveBeenCalledWith({
        id,
        eth_address: wallet.address,
      })
    })
  })

  describe('and the caller does not own the deployment', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Deployment, id, anotherAddress)
    })

    it('should respond with a 401 without deleting the deployment', async () => {
      await server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(401)

      expect(Deployment.delete).not.toHaveBeenCalled()
    })
  })
})
