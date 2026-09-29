import fetch from 'node-fetch'
import { env } from 'decentraland-commons'

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
    })
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
