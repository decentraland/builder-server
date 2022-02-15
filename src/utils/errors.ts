export class InvalidRequestError extends Error {
  constructor(public message: string) {
    super(`Invalid request. Error: ${message}.`)
  }
}
