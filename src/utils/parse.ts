export function unsafeParseInt(str: string) {
  if (!Number.isInteger(Number(str))) {
    throw new Error(`Invalid integer "${str}"`)
  }
  return parseInt(str, 10)
}

export function toArray<T = any>(value: T | T[] | null): T[] {
  if (value === null) {
    return []
  }

  if (Array.isArray(value)) {
    return value
  }

  return [value]
}
