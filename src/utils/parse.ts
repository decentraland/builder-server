export function unsafeParseInt(str: string) {
  if (!Number.isInteger(Number(str))) {
    throw new Error(`Invalid integer "${str}"`)
  }
  return parseInt(str, 10)
}
