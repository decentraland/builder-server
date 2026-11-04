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

export class CollectionBusyError extends Error {
  constructor(public id: string) {
    super('The collection is being updated, try again in a moment')
  }
}
