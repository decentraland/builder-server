import { db } from '../database'
import { CollectionBusyError } from './AutoCuration.errors'
import { withCollectionLock } from './collectionLock'

jest.mock('../database', () => ({ db: { query: jest.fn() } }))

const mockQuery = db.query as jest.Mock
const collectionId = 'aCollectionId'

describe('when running a task under the collection lock', () => {
  let task: jest.Mock

  beforeEach(() => {
    task = jest.fn().mockResolvedValue('done')
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.useRealTimers()
  })

  describe('and the advisory lock is free', () => {
    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }])
    })

    it('should run the task and release the lock', async () => {
      await expect(withCollectionLock(collectionId, task)).resolves.toBe('done')

      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('pg_try_advisory_lock'),
        [expect.any(Number), collectionId]
      )
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('pg_advisory_unlock'),
        [expect.any(Number), collectionId]
      )
    })
  })

  describe('and the task fails', () => {
    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }])
      task.mockRejectedValueOnce(new Error('boom'))
    })

    it('should still release the lock', async () => {
      await expect(withCollectionLock(collectionId, task)).rejects.toThrow(
        'boom'
      )
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('pg_advisory_unlock'),
        [expect.any(Number), collectionId]
      )
    })
  })

  describe('and another instance keeps the advisory lock', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      mockQuery.mockResolvedValue([{ locked: false }])
    })

    it('should give up with a busy error without running the task', async () => {
      const result = withCollectionLock(collectionId, task)
      const assertion = expect(result).rejects.toThrow(CollectionBusyError)
      for (let i = 0; i < 25; i++) {
        await Promise.resolve()
        jest.advanceTimersByTime(100)
        await Promise.resolve()
      }
      await assertion
      expect(task).not.toHaveBeenCalled()
    })
  })

  describe('and two tasks of the same collection run at once in this process', () => {
    beforeEach(() => {
      mockQuery.mockImplementation((query: string) =>
        Promise.resolve(
          query.includes('pg_try_advisory_lock') ? [{ locked: true }] : [{}]
        )
      )
    })

    it('should run them one after the other', async () => {
      const order: string[] = []
      const slow = () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            order.push('first')
            resolve()
          }, 20)
        )
      const fast = async () => {
        order.push('second')
      }

      await Promise.all([
        withCollectionLock(collectionId, slow),
        withCollectionLock(collectionId, fast),
      ])

      expect(order).toEqual(['first', 'second'])
    })
  })
})
