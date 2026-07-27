import { withModelAuthorization } from './model'

function mockResponse() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

const fakeModel = { tableName: 'collections' } as any
const req = { params: { id: 'some-id' }, auth: { ethAddress: '0xabc' } } as any

describe('withModelAuthorization', () => {
  describe('when the ownership check rejects', () => {
    it('should forward the error to next instead of leaving an unhandled rejection', async () => {
      const boom = new Error('subgraph down')
      const middleware = withModelAuthorization(fakeModel, 'id', () =>
        Promise.reject(boom)
      )
      const res = mockResponse()
      const next = jest.fn()

      await expect(middleware(req, res, next)).resolves.toBeUndefined()

      expect(next).toHaveBeenCalledWith(boom)
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe('when the caller is not the owner', () => {
    it('should respond 401 without calling next', async () => {
      const middleware = withModelAuthorization(fakeModel, 'id', () =>
        Promise.resolve(false)
      )
      const res = mockResponse()
      const next = jest.fn()

      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when the caller is the owner', () => {
    it('should call next with no error', async () => {
      const middleware = withModelAuthorization(fakeModel, 'id', () =>
        Promise.resolve(true)
      )
      const res = mockResponse()
      const next = jest.fn()

      await middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(res.status).not.toHaveBeenCalled()
    })
  })
})
