export class NonExistentThirdPartyError extends Error {
  constructor(public id: string) {
    super("The Third Party doesn't exists.")
  }
}
