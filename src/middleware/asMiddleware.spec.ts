import { guardAsync } from './asMiddleware'

describe('guardAsync', () => {
  describe('when the wrapped middleware rejects', () => {
    it('should route the error to next instead of rejecting', async () => {
      const boom = new Error('boom')
      const guarded = guardAsync(async () => {
        throw boom
      })
      const next = jest.fn()

      await expect(guarded({} as any, {} as any, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalledWith(boom)
    })
  })

  describe('when the wrapped middleware calls next itself', () => {
    it('should not add an error', async () => {
      const guarded = guardAsync(async (_req, _res, next) => {
        next()
      })
      const next = jest.fn()

      await guarded({} as any, {} as any, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith()
    })
  })

  describe('when the wrapped middleware responds without calling next', () => {
    it('should leave next untouched', async () => {
      const guarded = guardAsync(async (_req, res) => {
        ;(res as any).status(401)
      })
      const res = { status: jest.fn() }
      const next = jest.fn()

      await guarded({} as any, res as any, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })
  })
})
