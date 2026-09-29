import { timingSafeEqual } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'
import { Router } from '../common/Router'
import { asyncHandler } from '../common/asyncHandler'
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
  CurationNotRejectedError,
  MissingCurationError,
  NotStandardCollectionError,
  ValidationInProgressError,
  ValidationLimitReachedError,
} from './AutoCuration.errors'

const DEFAULT_EVENTS_LIMIT = 50
const MAX_EVENTS_LIMIT = 200

function isSameToken(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  )
}

/** Authenticates the collections curation server callback with its bearer token. */
export function withCallbackToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const expectedToken = env.get('BUILDER_CALLBACK_TOKEN', '')
  const [scheme, receivedToken = ''] = (
    req.header('authorization') ?? ''
  ).split(' ')

  if (
    !expectedToken ||
    scheme !== 'Bearer' ||
    !isSameToken(receivedToken, expectedToken)
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
      withAutoCurationEnabled,
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.requestValidation)
    )

    this.router.post(
      '/collections/:id/curation/appeal',
      withCors,
      withAutoCurationEnabled,
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      withSchemaValidation(appealSchema),
      server.handleRequest(this.appeal)
    )

    this.router.get(
      '/collections/:id/events',
      withCors,
      withAutoCurationEnabled,
      withAuthentication,
      withCollectionExists,
      server.handleRequest(this.getEvents)
    )

    this.router.post(
      '/collections/:id/validation-result',
      withAutoCurationEnabled,
      withCallbackToken,
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
        error instanceof NotStandardCollectionError
      ) {
        throw new HTTPError(error.message, { id }, STATUS_CODES.conflict)
      }

      throw error
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

      throw error
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
    await this.service.handleValidationResult(id, req.body as ValidationResult)
    res.status(204).end()
  }
}
