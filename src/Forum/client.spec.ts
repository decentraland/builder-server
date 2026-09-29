import fetch, { Response } from 'node-fetch'
import { DuplicatedForumPostTitleError } from './Forum.errors'
import { ForumPost } from './Forum.types'
import {
  createAssigneeEventPost,
  createPost,
  getPost,
  removeEmojis,
  updatePost,
} from './client'

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

  describe('and the forum rejects the title as already used', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () =>
          JSON.stringify({
            action: 'create_post',
            errors: ['Title has already been used'],
          }),
      } as Response)
    })

    it('should reject with a duplicated title error', async () => {
      await expect(createPost(post)).rejects.toBeInstanceOf(
        DuplicatedForumPostTitleError
      )
    })

    it('should reject without the forum message the builder retries on', async () => {
      const error = await createPost(post).catch((reason) => reason)
      expect(error.message).not.toContain('Title has already been used')
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

describe('when fetching a forum post', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the forum responds with a non-2xx status', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
    })

    it('should reject with the fetch error', async () => {
      await expect(getPost(42)).rejects.toThrow('Error fetching the post 42')
    })
  })

  describe('and the forum responds with a non-JSON body', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON')
        },
      } as unknown) as Response)
    })

    it('should reject with an invalid response body error', async () => {
      await expect(getPost(42)).rejects.toThrow(
        'Error fetching the post 42: invalid response body'
      )
    })
  })
})

describe('when updating a forum post', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the forum responds with a non-2xx status without an errors array', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => JSON.stringify({ error_type: 'unavailable' }),
      } as Response)
    })

    it('should reject with the update error', async () => {
      await expect(updatePost(7, 'new body')).rejects.toThrow(
        'Error updating the post 7'
      )
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
      await expect(updatePost(7, 'new body')).rejects.toThrow('Bad Gateway')
    })
  })
})
