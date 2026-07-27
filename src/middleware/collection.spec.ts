import { Collection } from '../Collection'
import { withCollectionExists } from './collection'

jest.mock('../Collection')

function mockResponse() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

const VALID_UUID = '11111111-1111-1111-8111-111111111111'

describe('withCollectionExists', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the existence query rejects', () => {
    it('should forward the error to next instead of leaving an unhandled rejection', async () => {
      const boom = new Error('db down')
      ;(Collection.count as jest.Mock).mockRejectedValueOnce(boom)
      const middleware = withCollectionExists('id')
      const res = mockResponse()
      const next = jest.fn()

      await expect(
        middleware({ params: { id: VALID_UUID } } as any, res, next)
      ).resolves.toBeUndefined()

      expect(next).toHaveBeenCalledWith(boom)
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe('when the id is neither a uuid nor a contract address', () => {
    it('should respond 400 without calling next', async () => {
      const middleware = withCollectionExists('id')
      const res = mockResponse()
      const next = jest.fn()

      await middleware({ params: { id: 'garbage' } } as any, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(next).not.toHaveBeenCalled()
    })
  })
})
