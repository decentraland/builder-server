import fetch from 'node-fetch'
import { env } from 'decentraland-commons'

const WAREHOUSE_URL: string = env.get('WAREHOUSE_URL')
const WAREHOUSE_TOKEN: string = env.get('WAREHOUSE_TOKEN')
const WAREHOUSE_CONTEXT_PREFIX: string | undefined = env.get(
  'WAREHOUSE_CONTEXT_PREFIX'
)

if (!WAREHOUSE_URL) {
  throw new Error('The WAREHOUSE_URL is not set.')
}

if (!WAREHOUSE_TOKEN) {
  throw new Error('The WAREHOUSE_TOKEN is not set.')
}

/**
 * Sends data to the warehouse to be stored.
 *
 * @param context - The name of the application storing data.
 * @param event - The name of the event that we are registering.
 * @param body - The contet of the event that we are registering.
 */
export async function sendDataToWarehouse(
  context: string,
  event: string,
  body: any
): Promise<void> {
  const data = {
    context: WAREHOUSE_CONTEXT_PREFIX
      ? `${WAREHOUSE_CONTEXT_PREFIX}-${context}`
      : context,
    event,
    body,
  }

  await fetch(WAREHOUSE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-token': WAREHOUSE_TOKEN,
    },
    body: JSON.stringify(data),
  })
}
