import { HTTPError, STATUS_CODES } from '../common/HTTPError'

export class ValidationInProgressError extends Error {
  constructor(public id: string) {
    super('A validation is already in progress for this collection')
  }
}

export class ValidationLimitReachedError extends Error {
  constructor(public id: string, public retryAt: Date) {
    super('The daily validation limit for this collection was reached')
  }
}

export class NotStandardCollectionError extends Error {
  constructor(public id: string) {
    super('Only standard collections can be validated automatically')
  }
}

export class AppealAlreadyOpenError extends Error {
  constructor(public id: string) {
    super('There is already an open appeal for this collection')
  }
}

export class CurationNotRejectedError extends Error {
  constructor(public id: string) {
    super('Only rejected collections can be appealed')
  }
}

export class CurationRejectedByCuratorError extends Error {
  constructor(public id: string) {
    super(
      'A curator rejected this collection: submit your changes for review instead of validating again'
    )
  }
}

export class NothingToRevalidateError extends Error {
  constructor(public id: string) {
    super(
      'Nothing changed since the last validation: edit an item or appeal the decision'
    )
  }
}

export class NothingToValidateError extends Error {
  constructor(public id: string) {
    super('There is nothing to validate again: submit your changes for review')
  }
}

export class TooLargeToValidateError extends Error {
  constructor(public id: string) {
    super(
      'The collection is too large for an automatic review: a curator will review it'
    )
  }
}

export class CollectionBusyError extends Error {
  constructor(public id: string) {
    super('The collection is being updated, try again in a moment')
  }
}

/** Maps the service's expected failures to HTTP answers; anything else is rethrown. */
export function toAutoCurationHTTPError(error: unknown, id: string): unknown {
  if (error instanceof ValidationInProgressError) {
    return new HTTPError(error.message, { id }, STATUS_CODES.conflict)
  }
  if (error instanceof ValidationLimitReachedError) {
    return new HTTPError(
      error.message,
      { id, retryAt: error.retryAt.toISOString() },
      STATUS_CODES.tooManyRequests
    )
  }
  if (
    error instanceof AppealAlreadyOpenError ||
    error instanceof CurationNotRejectedError ||
    error instanceof CurationRejectedByCuratorError ||
    error instanceof NotStandardCollectionError ||
    error instanceof NothingToRevalidateError ||
    error instanceof NothingToValidateError ||
    error instanceof TooLargeToValidateError
  ) {
    return new HTTPError(error.message, { id }, STATUS_CODES.conflict)
  }
  // Another instance holds the collection: 503 makes the Builder and the validator job retry instead of giving up.
  if (error instanceof CollectionBusyError) {
    return new HTTPError(error.message, { id }, STATUS_CODES.serviceUnavailable)
  }
  return error
}
