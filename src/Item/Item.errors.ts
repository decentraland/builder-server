export enum ItemAction {
  DELETE = 'deleted',
}

export enum ItemType {
  DCL,
  THIRD_PARTY,
}

export class NonExistentItemError extends Error {
  constructor(public id: string) {
    super("The item doesn't exist.")
  }
}

export class ThirdPartyItemAlreadyPublishedError extends Error {
  constructor(public id: string, public urn: string, action: ItemAction) {
    super(`The third party item is already published. It can't be ${action}.`)
  }
}

export class DCLItemAlreadyPublishedError extends Error {
  constructor(
    public id: string,
    public blockchainItemId: string,
    public contractAddress: string,
    action: ItemAction
  ) {
    super(
      `The collection that contains this item has been already published. The item can't be ${action}.`
    )
  }
}

export class CollectionForItemLockedError extends Error {
  constructor(public id: string, action: ItemAction) {
    super(`The collection for the item is locked. The item can't be ${action}.`)
  }
}

export class InconsistentItemError extends Error {
  constructor(public id: string, message: string) {
    super(message)
  }
}
