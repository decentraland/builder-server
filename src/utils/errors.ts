export class InvalidRequestError extends Error {
  constructor(public message: string) {
    super(message)
  }
}
