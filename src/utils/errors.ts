export class InvalidRequestError extends Error {
  constructor(public message: string) {
    super(message)
  }
}

export function isErrorWithMessage(error: unknown): error is Error {
  return (
    error !== undefined &&
    error !== null &&
    typeof error === 'object' &&
    'message' in error
  )
}
