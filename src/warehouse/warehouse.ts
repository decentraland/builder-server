import { env } from 'decentraland-commons'

const WAREHOUSE_URL: string = env.get('WAREHOUSE_URL')
const WAREHOUSE_TOKEN: string = env.get('WAREHOUSE_TOKEN')
const WAREHOUSE_CONTEXT_PREFIX: string = env.get('WAREHOUSE_CONTEXT_PREFIX')

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
