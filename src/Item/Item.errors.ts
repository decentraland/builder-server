export enum ItemAction {
  DELETE = 'deleted',
  INSERT = 'inserted',
  UPSERT = 'inserted or updated',
  RARITY_UPDATE = 'updated with a new rarity',
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

export class UnpublishedItemError extends Error {
  constructor(public id: string) {
    super('The item is not published.')
  }
}

export class ThirdPartyItemAlreadyPublishedError extends Error {
  constructor(public id: string, public urn: string, action: ItemAction) {
    super(`The third party item is already published. It can't be ${action}.`)
  }
}

export class ThirdPartyItemInsertByURNError extends Error {
  constructor(public urn: string) {
    super('The third party item can not be created by URN.')
  }
}

export class URNAlreadyInUseError extends Error {
  constructor(public id: string, public urn: string, action: ItemAction) {
    super(
      `The URN provided already belong to another item. The item can't be ${action}.`
    )
  }
}

export class DCLItemAlreadyPublishedError extends Error {
  constructor(
    public id: string,
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

export class ItemCantBeMovedFromCollectionError extends Error {
  constructor(public id: string) {
    super("Item can't change between collections.")
  }
}

export class UnauthorizedToUpsertError extends Error {
  constructor(public id: string, public eth_address: string) {
    super('The user is unauthorized to upsert the collection.')
  }
}

export class UnauthorizedToChangeToCollectionError extends Error {
  constructor(
    public id: string,
    public eth_address: string,
    public collection_id: string
  ) {
    super("The new collection for the item isn't owned by the same owner.")
  }
}

export class InvalidItemURNError extends Error {
  constructor() {
    super('The item URN is invalid.')
  }
}
