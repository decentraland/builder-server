export class NonExistentThirdPartyError extends Error {
  constructor(public id: string) {
    super("The Third Party doesn't exists.")
  }
}

export class UnauthorizedThirdPartyManagerError extends Error {
  constructor(public id: string) {
    super('You are not the manager of this Third Party.')
  }
}

export class OnlyDeletableIfOnGraphError extends Error {
  constructor(public id: string) {
    super("The Third Party can only be deleted if it's already on the graph.")
  }
}
