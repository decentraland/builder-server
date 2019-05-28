export function validateProps(
  object: Record<string, any>,
  props: string[]
): string[] {
  const errors = []
  for (const prop of props) {
    if (typeof object[prop] === 'undefined') {
      errors.push(`Missing ${prop}`)
    }
  }
  return errors
}

export function formatErrors(errors: string[]): string {
  return errors.map(error => `\t- ${error}`).join('')
}
