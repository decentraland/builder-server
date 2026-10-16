import { createHmac, timingSafeEqual } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { Router } from '../common/Router'
import { asyncHandler } from '../common/asyncHandler'
import { RawBodyRequest } from '../common/ExpressApp'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withSchemaValidation } from '../middleware'
import { ValidationResult, validationResultSchema } from './AutoCuration.types'

export const SIGNATURE_HEADER = 'x-wearable-validator-signature'
export const TIMESTAMP_HEADER = 'x-wearable-validator-timestamp'
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000

const logger = createConsoleLogComponent().getLogger('AutoCuration')

export function signValidatorPayload(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  return `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')}`
}

export function isValidValidatorSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  const sentAt = Number(timestamp)
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(Date.now() - sentAt) > SIGNATURE_MAX_AGE_MS
  ) {
    return false
  }
  const expected = Buffer.from(signValidatorPayload(secret, timestamp, rawBody))
  const received = Buffer.from(signature)
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  )
}

/** Authenticates the wearable validator callback by the HMAC of its raw body. */
export function withValidatorSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const secret = env.get('WEARABLE_VALIDATOR_CALLBACK_SECRET', '')
  const { rawBody } = req as RawBodyRequest
  const timestamp = req.header(TIMESTAMP_HEADER)
  const signature = req.header(SIGNATURE_HEADER)

  if (
    !secret ||
    rawBody === undefined ||
    !timestamp ||
    !signature ||
    !isValidValidatorSignature(secret, timestamp, rawBody, signature)
  ) {
    res
      .status(STATUS_CODES.unauthorized)
      .json(server.sendError({}, 'Unauthorized'))
    return
  }

  next()
}

export class AutoCurationRouter extends Router {
  mount() {
    // Not gated by the feature flag: a result for a job that was in flight when the flag went off must still
    // be accepted, otherwise the job retries it into its dead-letter queue.
    this.router.post(
      '/collections/:id/validation-result',
      withValidatorSignature,
      withSchemaValidation(validationResultSchema),
      asyncHandler(this.receiveValidationResult)
    )
  }

  /** The result is only logged for now; the Slack thread the job posts is what curators read. */
  receiveValidationResult = async (req: Request, res: Response) => {
    const id = server.extractFromReq(req, 'id')
    const result = req.body as ValidationResult
    if (result.collectionId !== id) {
      throw new HTTPError(
        'The result belongs to another collection',
        { id, collectionId: result.collectionId },
        STATUS_CODES.badRequest
      )
    }

    const items = result.items
      .map((item) => `${item.itemId}=${item.passed ?? 'undecided'}`)
      .join(' ')
    logger.info(
      `Validation ${result.validationId} of collection ${id} ended ${result.verdict} (rules ${result.rulesVersion}): ${items}`
    )
    res.status(204).end()
  }
}
