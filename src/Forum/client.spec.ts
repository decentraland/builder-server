import fetch, { Response } from 'node-fetch'
import { ForumPost } from './Forum.types'
import { createAssigneeEventPost, createPost, removeEmojis } from './client'

jest.mock('node-fetch')
jest.mock('decentraland-commons')

const mockFetch = fetch as jest.MockedFunction<typeof fetch>

describe('when removing emojis from a string that has 2 ⚡️', () => {
  it('should return a string without the ⚡️s', () => {
    const result = removeEmojis('⚡️ VOLTZ ⚡️ Genesis Drop #ØØ')
    const expected = ' VOLTZ  Genesis Drop #ØØ'

    const encode = (text: string) =>
      new TextEncoder().encodeInto(text, new Uint8Array())

    expect(encode(result)).toEqual(encode(expected))
  })
})

describe('when creating a forum post', () => {
  let post: Pick<ForumPost, 'title' | 'raw'>

  beforeEach(() => {
    post = { title: 'A title', raw: 'The body' }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the forum responds with a 2xx status', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({ id: 1, topic_id: 2, topic_slug: 'a-title' }),
      } as Response)
    })

    it('should resolve with the created post id and link', async () => {
      const result = await createPost(post)

      expect(result).toEqual({
        id: 1,
        link: expect.stringContaining('/t/a-title/2'),
      })
    })
  })

  describe('and the forum responds with a non-2xx status without an errors array', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => JSON.stringify({ error_type: 'rate_limit' }),
      } as Response)
    })

    it('should reject instead of returning a malformed link', async () => {
      await expect(createPost(post)).rejects.toThrow('Too Many Requests')
    })
  })

  describe('and the forum responds with a non-JSON body', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => '<html>Bad Gateway</html>',
      } as Response)
    })

    it('should reject with the response body instead of throwing a parse error', async () => {
      await expect(createPost(post)).rejects.toThrow('Bad Gateway')
    })
  })
})

describe('when creating an assignee event post', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the forum responds with a non-2xx status without an errors array', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ error_type: 'forbidden' }),
      } as Response)
    })

    it('should reject with the assignee post error', async () => {
      await expect(createAssigneeEventPost(10, 'A reply')).rejects.toThrow(
        'Error creating the assignee post for topic 10'
      )
    })
  })
})
