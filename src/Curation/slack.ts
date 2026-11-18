import { env } from 'decentraland-commons'
import { escapeSlackText, sendSlackMessage, toOneLine } from '../Slack'

export { escapeSlackText, toOneLine }

/** Posts a line to the curators' channel through the shared bot. Best effort: an unset channel or token skips it. */
export async function notifyCurationSlack(text: string): Promise<void> {
  const channel = env.get('SLACK_CURATION_CHANNEL', '')
  if (!channel) {
    return
  }
  await sendSlackMessage({ channel, text })
}
