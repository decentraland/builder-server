export enum CollectionType {
  THIRD_PARTY,
  DCL,
}

export enum CollectionAction {
  DELETE = 'deleted',
  UPSERT = 'updated or inserted',
  UPDATE = 'updated',
}

export class LockedCollectionError extends Error {
  constructor(public id: string, action: CollectionAction) {
    super(`The collection is locked. It can't be ${action}.`)
  }
}

export class AlreadyPublishedCollectionError extends Error {
  constructor(
    public id: string,
    type: CollectionType,
    action: CollectionAction
  ) {
    super(
      type === CollectionType.DCL
        ? `The collection is published. It can't be ${action}.`
        : `The third party collection already has published items. It can't be ${action}.`
    )
  }
}

export class URNAlreadyInUseError extends Error {
  constructor(public id: string, public urn: string, action: CollectionAction) {
    super(
      `The URN provided already belongs to a collection. The collection can't be ${action}.`
    )
  }
}

export class WrongCollectionError extends Error {
  constructor(m: string, public data: Record<string, any>) {
    super(m)
  }
}

export class UnauthorizedCollectionEditError extends Error {
  constructor(public id: string, public eth_address: string) {
    super('Unauthorized to upsert collection')
  }
}

export class UnpublishedCollectionError extends Error {
  constructor(public id: string) {
    super('The collection is not published.')
  }
}

export class NonExistentCollectionError extends Error {
  constructor(public id?: string) {
    super("The collection doesn't exist.")
  }
}

export class InsufficientSlotsError extends Error {
  constructor(public id?: string) {
    super('The amount of items to publish exceeds the available slots.')
  }
}
