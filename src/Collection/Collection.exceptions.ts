export enum CollectionType {
  THIRD_PARTY,
  DCL,
}

export enum CollectionAction {
  DELETE = 'deleted',
  UPSERT = 'updated or inserted',
  UPDATE = 'updated',
}

export class CollectionLockedException extends Error {
  constructor(public id: string, action: CollectionAction) {
    super(`The collection is locked. It can't be ${action}.`)
  }
}

export class CollectionAlreadyPublishedException extends Error {
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

export class WrongCollectionException extends Error {
  constructor(m: string, public data: Record<string, any>) {
    super(m)
  }
}

export class UnauthorizedCollectionEditException extends Error {
  constructor(public id: string, public eth_address: string) {
    super('Unauthorized to upsert collection')
  }
}

export class NonExistentCollectionException extends Error {
  constructor(public id: string) {
    super("The collection doesn't exist.")
  }
}
