import { createHmac, timingSafeEqual } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'
import { Router } from '../common/Router'
import { asyncHandler } from '../common/asyncHandler'
import { RawBodyRequest } from '../common/ExpressApp'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import {
  AuthRequest,
  guardAsync,
  withAuthentication,
  withModelAuthorization,
  withModelExists,
  withSchemaValidation,
} from '../middleware'
import { withCors } from '../middleware/cors'
import { isCommitteeMember } from '../Committee'
import { OwnableModel } from '../Ownable/Ownable.types'
import { Collection } from '../Collection/Collection.model'
import { CollectionService } from '../Collection/Collection.service'
import { getPaginationParams } from '../Pagination/utils'
import { AutoCurationService } from './AutoCuration.service'
import {
  appealSchema,
  ValidationResult,
  validationResultSchema,
} from './AutoCuration.types'
import {
  AppealAlreadyOpenError,
  CollectionBusyError,
  CurationNotRejectedError,
  MissingCurationError,
  NothingToRevalidateError,
  NotStandardCollectionError,
  ValidationInProgressError,
  ValidationLimitReachedError,
} from './AutoCuration.errors'

const DEFAULT_EVENTS_LIMIT = 50
const MAX_EVENTS_LIMIT = 200
const RATE_LIMIT_WINDOW_MS = 60 * 1000

// Keyed by the signed address: there is no trusted proxy config, so every caller would share the balancer's IP.
const limitPerAddress = (limit: number) =>
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthRequest).auth.ethAddress.toLowerCase(),
  })

export const SIGNATURE_HEADER = 'x-wearable-validator-signature'
export const TIMESTAMP_HEADER = 'x-wearable-validator-timestamp'
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000

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
  public service = new AutoCurationService()
  public collectionService = new CollectionService()

  mount() {
    // With the flag off none of these routes exist, so the legacy flow stays untouched.
    // It runs after auth so anonymous calls never fetch the flag.
    const withAutoCurationEnabled = guardAsync(
      async (_: Request, res: Response, next: NextFunction) => {
        if (await this.service.isEnabled()) {
          next()
        } else {
          res
            .status(STATUS_CODES.notFound)
            .json(server.sendError({}, 'Not found'))
        }
      }
    )
    const withWriteRateLimit = limitPerAddress(30)
    // The timeline polls every 10 seconds while a review runs.
    const withReadRateLimit = limitPerAddress(120)
    const withCollectionExists = withModelExists(Collection, 'id')
    const withCollectionAuthorization = withModelAuthorization(
      Collection,
      'id',
      (_: OwnableModel, id: string, ethAddress: string) =>
        this.collectionService.isOwnedOrManagedBy(id, ethAddress)
    )

    this.router.options('/collections/:id/validations', withCors)
    this.router.options('/collections/:id/curation/appeal', withCors)
    this.router.options('/collections/:id/events', withCors)

    this.router.post(
      '/collections/:id/validations',
      withCors,
      withAuthentication,
      withWriteRateLimit,
      withAutoCurationEnabled,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.requestValidation)
    )

    this.router.post(
      '/collections/:id/curation/appeal',
      withCors,
      withAuthentication,
      withWriteRateLimit,
      withAutoCurationEnabled,
      withCollectionExists,
      withCollectionAuthorization,
      withSchemaValidation(appealSchema),
      server.handleRequest(this.appeal)
    )

    this.router.get(
      '/collections/:id/events',
      withCors,
      withAuthentication,
      withReadRateLimit,
      withAutoCurationEnabled,
      withCollectionExists,
      server.handleRequest(this.getEvents)
    )

    // The signature goes first so an unauthenticated caller cannot tell whether the flag is on.
    this.router.post(
      '/collections/:id/validation-result',
      withValidatorSignature,
      withAutoCurationEnabled,
      withCollectionExists,
      withSchemaValidation(validationResultSchema),
      asyncHandler(this.receiveValidationResult)
    )
  }

  requestValidation = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')

    try {
      return await this.service.requestValidation(id, req.auth.ethAddress)
    } catch (error) {
      if (error instanceof ValidationInProgressError) {
        throw new HTTPError(error.message, { id }, STATUS_CODES.conflict)
      } else if (error instanceof ValidationLimitReachedError) {
        throw new HTTPError(
          error.message,
          { id, retryAt: error.retryAt.toISOString() },
          STATUS_CODES.tooManyRequests
        )
      } else if (
        error instanceof MissingCurationError ||
        error instanceof NotStandardCollectionError ||
        error instanceof NothingToRevalidateError
      ) {
        throw new HTTPError(error.message, { id }, STATUS_CODES.conflict)
      }

      throw toBusyHTTPError(error, id)
    }
  }

  appeal = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')

    try {
      return await this.service.appeal(id, req.auth.ethAddress, req.body.note)
    } catch (error) {
      if (
        error instanceof AppealAlreadyOpenError ||
        error instanceof CurationNotRejectedError
      ) {
        throw new HTTPError(error.message, { id }, STATUS_CODES.conflict)
      }

      throw toBusyHTTPError(error, id)
    }
  }

  getEvents = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress

    const isCommittee = await isCommitteeMember(ethAddress)
    if (
      !isCommittee &&
      !(await this.collectionService.isOwnedOrManagedBy(id, ethAddress))
    ) {
      throw new HTTPError(
        'Unauthorized',
        { id, ethAddress },
        STATUS_CODES.unauthorized
      )
    }

    const { page = 1, limit = DEFAULT_EVENTS_LIMIT } = getPaginationParams(req)
    return this.service.getEvents(
      id,
      Math.max(page, 1),
      Math.min(Math.max(limit, 1), MAX_EVENTS_LIMIT),
      isCommittee
    )
  }

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
    try {
      await this.service.handleValidationResult(id, result)
    } catch (error) {
      throw toBusyHTTPError(error, id)
    }
    res.status(204).end()
  }
}

/** Another instance holds the collection: 503 makes the Builder and the validator job retry instead of giving up. */
function toBusyHTTPError(error: unknown, id: string): unknown {
  return error instanceof CollectionBusyError
    ? new HTTPError(error.message, { id }, STATUS_CODES.serviceUnavailable)
    : error
}
