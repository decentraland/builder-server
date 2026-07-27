import { withModelExists } from './model'

function mockResponse() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

const VALID_UUID = '11111111-1111-1111-8111-111111111111'
const req = { params: { id: VALID_UUID } } as any

describe('withModelExists', () => {
  describe('when the count query rejects', () => {
    it('should forward the error to next instead of leaving an unhandled rejection', async () => {
      const boom = new Error('db down')
      const fakeModel = {
        tableName: 'collections',
        count: jest.fn().mockRejectedValue(boom),
      } as any
      const middleware = withModelExists(fakeModel, 'id')
      const res = mockResponse()
      const next = jest.fn()

      await expect(middleware(req, res, next)).resolves.toBeUndefined()

      expect(next).toHaveBeenCalledWith(boom)
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe('when the id is not a valid uuid', () => {
    it('should respond 400 without calling next or querying', async () => {
      const fakeModel = { tableName: 'collections', count: jest.fn() } as any
      const middleware = withModelExists(fakeModel, 'id')
      const res = mockResponse()
      const next = jest.fn()

      await middleware({ params: { id: 'not-a-uuid' } } as any, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(fakeModel.count).not.toHaveBeenCalled()
      expect(next).not.toHaveBeenCalled()
    })
  })
})
