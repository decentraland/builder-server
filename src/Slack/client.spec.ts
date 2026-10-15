import fetch from 'node-fetch'
import { env } from 'decentraland-commons'
import { escapeSlackText, sendSlackMessage } from './client'

jest.mock('node-fetch')
jest.mock('decentraland-commons', () => ({
  env: { get: jest.fn() },
}))

const mockFetch = fetch as jest.MockedFunction<typeof fetch>
const mockEnvGet = env.get as jest.Mock

function mockSlackResponse(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status < 400,
    status,
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as any)
}

afterEach(() => {
  jest.resetAllMocks()
})

describe('when escaping text for Slack', () => {
  it('should neutralize the markup characters', () => {
    expect(escapeSlackText('<!channel> Tom & Jerry <http://x.y|x>')).toBe(
      '&lt;!channel&gt; Tom &amp; Jerry &lt;http://x.y|x&gt;'
    )
  })
})

describe('when sending a Slack message', () => {
  const message = { channel: 'a-channel', text: 'hello' }

  describe('and the bot token is not configured', () => {
    beforeEach(() => {
      mockEnvGet.mockReturnValue('')
    })

    it('should not call Slack and resolve to false', async () => {
      await expect(sendSlackMessage(message)).resolves.toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('and the bot token is configured', () => {
    beforeEach(() => {
      mockEnvGet.mockImplementation((key: string) =>
        key === 'SLACK_BOT_TOKEN' ? 'xoxb-example123' : ''
      )
    })

    describe('and Slack accepts the message', () => {
      beforeEach(() => {
        mockSlackResponse({ ok: true })
      })

      it('should post the message with the bot token, without link previews, and resolve to true', async () => {
        await expect(sendSlackMessage(message)).resolves.toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
          'https://slack.com/api/chat.postMessage',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer xoxb-example123',
            }),
            body: JSON.stringify({
              ...message,
              unfurl_links: false,
              unfurl_media: false,
            }),
          })
        )
      })
    })

    describe('and Slack refuses the message', () => {
      beforeEach(() => {
        mockSlackResponse({ ok: false, error: 'not_in_channel' })
      })

      it('should resolve to false without throwing', async () => {
        await expect(sendSlackMessage(message)).resolves.toBe(false)
      })
    })

    describe('and Slack answers an HTML error page', () => {
      beforeEach(() => {
        mockSlackResponse('<html>Bad Gateway</html>', 502)
      })

      it('should resolve to false and log the HTTP status', async () => {
        const stderr = jest
          .spyOn(process.stderr, 'write')
          .mockImplementation(() => true)
        await expect(sendSlackMessage(message)).resolves.toBe(false)
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('502'))
      })
    })

    describe('and the request fails', () => {
      beforeEach(() => {
        mockFetch.mockRejectedValueOnce(new Error('network down'))
      })

      it('should resolve to false without throwing', async () => {
        await expect(sendSlackMessage(message)).resolves.toBe(false)
      })
    })
  })
})
