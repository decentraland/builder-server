import fetch from 'node-fetch'
import { env } from 'decentraland-commons'

const SLACK_API_URL = 'https://slack.com/api'
const REQUEST_TIMEOUT_MS = 10 * 1000

export type SlackBlock = {
  type: 'section' | 'header' | 'divider' | 'context' | 'actions'
  text?: { type: 'mrkdwn' | 'plain_text'; text: string }
  fields?: { type: 'mrkdwn' | 'plain_text'; text: string }[]
  elements?: Record<string, unknown>[]
}

export type SlackMessage = {
  /** Channel name or id. The bot must be a member of it. */
  channel: string
  /** Shown in notifications and by clients that cannot render blocks. */
  text: string
  blocks?: SlackBlock[]
}

/** Escapes the characters Slack parses as markup so user text cannot ping channels or disguise links. */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function isSlackConfigured(): boolean {
  return env.get('SLACK_BOT_TOKEN', '') !== ''
}

/**
 * Posts a message with the bot token in SLACK_BOT_TOKEN. Best effort: an unset token skips the send,
 * and any failure is logged and reported as `false`, never thrown.
 */
export async function sendSlackMessage(
  message: SlackMessage
): Promise<boolean> {
  const token = env.get('SLACK_BOT_TOKEN', '')
  if (!token) {
    return false
  }

  try {
    const response = await fetch(`${SLACK_API_URL}/chat.postMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(message),
      timeout: REQUEST_TIMEOUT_MS,
    })
    const result = (await response.json()) as { ok: boolean; error?: string }
    if (!response.ok || !result.ok) {
      console.warn(
        `Slack refused the message for ${message.channel}: ${
          result.error ?? response.status
        }`
      )
      return false
    }
    return true
  } catch (error) {
    console.warn(
      `Error sending the Slack message for ${message.channel}: ${
        (error as Error).message
      }`
    )
    return false
  }
}
