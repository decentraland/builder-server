import { db } from '../database'
import { AutoCurationService } from './AutoCuration.service'
import { runAutoCurationSweep, SWEEP_LOCK_KEY } from './sweep'

jest.mock('../database', () => ({ db: { query: jest.fn() } }))
jest.mock('./AutoCuration.service')

const mockQuery = db.query as jest.Mock

describe('when running the auto curation sweep', () => {
  let service: jest.Mocked<AutoCurationService>

  beforeEach(() => {
    service = new AutoCurationService() as jest.Mocked<AutoCurationService>
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and another instance holds the lock', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValueOnce([{ locked: false }])
    })

    it('should not sweep nor release the lock', async () => {
      await expect(runAutoCurationSweep(service)).resolves.toBe(false)

      expect(service.sweepStaleValidations).not.toHaveBeenCalled()
      expect(mockQuery).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the lock is acquired', () => {
    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }])
    })

    it('should sweep and release the lock', async () => {
      await expect(runAutoCurationSweep(service)).resolves.toBe(true)

      expect(service.sweepStaleValidations).toHaveBeenCalledTimes(1)
      expect(
        mockQuery
      ).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock($1)', [
        SWEEP_LOCK_KEY,
      ])
    })

    it('should release the lock when the sweep fails', async () => {
      service.sweepStaleValidations.mockRejectedValueOnce(new Error('boom'))

      await expect(runAutoCurationSweep(service)).rejects.toThrow('boom')

      expect(
        mockQuery
      ).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock($1)', [
        SWEEP_LOCK_KEY,
      ])
    })
  })
})
