import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { env } from 'decentraland-commons'
import { ValidationManifest } from './AutoCuration.types'

export const VALIDATION_REQUESTED_EVENT = {
  type: 'builder',
  subType: 'collection-validation-requested',
} as const
// SNS refuses messages over 256 KB; the margin covers the attributes and the envelope.
export const MAX_VALIDATION_MESSAGE_BYTES = 240 * 1024
// The validator job drops a request with more items without answering.
export const MAX_VALIDATION_ITEMS = 50

export class ValidationTooLargeError extends Error {
  constructor(public bytes: number, public itemCount: number) {
    super(
      `The validation request has ${itemCount} items and ${bytes} bytes, over the ${MAX_VALIDATION_ITEMS} items or ${MAX_VALIDATION_MESSAGE_BYTES} bytes it can carry`
    )
  }
}

let client: SNSClient | undefined

function getClient(): SNSClient {
  if (!client) {
    client = new SNSClient({
      region: env.get('AWS_REGION', '') || undefined,
      endpoint: env.get('AWS_SNS_ENDPOINT', '') || undefined,
    })
  }
  return client
}

/** Publishes the validation request on the events topic, where the validator job's queue picks it up. */
export async function requestValidation(
  manifest: ValidationManifest
): Promise<void> {
  const topicArn = env.get('AWS_SNS_ARN', '')
  if (!topicArn) {
    throw new Error('AWS_SNS_ARN is not configured')
  }

  const message = JSON.stringify({
    ...VALIDATION_REQUESTED_EVENT,
    key: manifest.collectionId,
    timestamp: Date.now(),
    metadata: manifest,
  })
  const bytes = Buffer.byteLength(message)
  if (
    bytes > MAX_VALIDATION_MESSAGE_BYTES ||
    manifest.items.length > MAX_VALIDATION_ITEMS
  ) {
    throw new ValidationTooLargeError(bytes, manifest.items.length)
  }

  await getClient().send(
    new PublishCommand({
      TopicArn: topicArn,
      Message: message,
      MessageAttributes: {
        type: {
          DataType: 'String',
          StringValue: VALIDATION_REQUESTED_EVENT.type,
        },
        subType: {
          DataType: 'String',
          StringValue: VALIDATION_REQUESTED_EVENT.subType,
        },
      },
    })
  )
  console.log(
    `Requested the validation ${manifest.validationId} of collection ${manifest.collectionId} (${manifest.items.length} items, ${bytes} bytes)`
  )
}
