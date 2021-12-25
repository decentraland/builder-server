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

export function fromUnixTimestamp(timestamp: number | string): Date {
  return new Date(Number(timestamp) * 1000)
}

export function toUnixTimestamp(timestamp: Date | number | string): string {
  return (Number(timestamp) / 1000).toString()
}
