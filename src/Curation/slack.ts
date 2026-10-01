import fetch from 'node-fetch'
import { env } from 'decentraland-commons'

const REQUEST_TIMEOUT_MS = 10 * 1000

/** Escapes the characters Slack parses as markup so user text cannot ping channels or disguise links. */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Posts to the curation Slack webhook. Failures are logged, never thrown. */
export async function notifyCurationSlack(text: string): Promise<void> {
  const webhookUrl = env.get('SLACK_CURATION_WEBHOOK_URL', '')
  if (!webhookUrl) {
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      timeout: REQUEST_TIMEOUT_MS,
    })
    await response.text()
    if (!response.ok) {
      console.warn(`The Slack webhook responded with ${response.status}`)
    }
  } catch (error) {
    console.warn(
      'Error sending the Slack notification',
      (error as Error).message
    )
  }
}
