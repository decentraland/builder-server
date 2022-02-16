export function shorten(fullAddress: string) {
  const address = fullAddress.trim()

  return address.length === 42
    ? address.slice(0, 6) + '...' + address.slice(42 - 5)
    : ''
}
