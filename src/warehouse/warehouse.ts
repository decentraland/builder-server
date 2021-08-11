import { env } from 'decentraland-commons'

const WAREHOUSE_URL: string = env.get('WAREHOUSE_URL')

export async function sendDataToWarehouse(
  context: string,
  event: string,
  body: any
): Promise<void> {
  const data = {
    context,
    event,
    body,
  }

  // Save the TOS in the warehouse
  await fetch(WAREHOUSE_URL, {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data), // body data type must match "Content-Type" header
  })
}
