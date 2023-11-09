import nodefetch, { Response } from 'node-fetch'
import { env } from 'decentraland-commons'
import { SubscriptionResponse } from './Newsletter.types'

const NEWSLETTER_SERVICE_URL = env.get('NEWSLETTER_SERVICE_URL', '')
const NEWSLETTER_PUBLICATION_ID = env.get('NEWSLETTER_PUBLICATION_ID', '')
const NEWSLETTER_SERVICE_API_KEY = env.get('NEWSLETTER_SERVICE_API_KEY', '')

export namespace Newsletter {
  export async function subscribe(
    email: string,
    source = 'Builder'
  ): Promise<SubscriptionResponse | null> {
    try {
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${NEWSLETTER_SERVICE_API_KEY}`,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: false,
          utm_source: source,
          utm_medium: 'organic',
        }),
      }
      const response = await nodefetch(
        `${NEWSLETTER_SERVICE_URL}/publications/${NEWSLETTER_PUBLICATION_ID}/subscriptions`,
        options
      )

      return response.json()
    } catch (error) {
      console.error(error)
      return null
    }
  }

  export async function deleteSubscription(
    subscriptionId: string
  ): Promise<Response | null> {
    try {
      const options = {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${NEWSLETTER_SERVICE_API_KEY}`,
        },
      }
      const response = await nodefetch(
        `${NEWSLETTER_SERVICE_URL}/publications/${NEWSLETTER_PUBLICATION_ID}/subscriptions/${subscriptionId}`,
        options
      )

      return response
    } catch (error) {
      console.error(error)
      return null
    }
  }

  export async function getSubscription(
    subscriptionId: string
  ): Promise<SubscriptionResponse | null> {
    try {
      const options = {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${NEWSLETTER_SERVICE_API_KEY}`,
        },
      }
      const response = await nodefetch(
        `${NEWSLETTER_SERVICE_URL}/publications/${NEWSLETTER_PUBLICATION_ID}/subscriptions/${subscriptionId}`,
        options
      )

      return response.json()
    } catch (error) {
      console.error(error)
      return null
    }
  }
}
