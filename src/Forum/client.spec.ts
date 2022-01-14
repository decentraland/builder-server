import { removeEmojis } from '.'

describe('foo', () => {
  it('bar', () => {
    const result = removeEmojis('⚡️ VOLTZ ⚡️ Genesis Drop #ØØ')
    const expected = '  VOLTZ   Genesis Drop #ØØ'

    const encode = (text: string) =>
      new TextEncoder().encodeInto(text, new Uint8Array())

    expect(encode(result)).toEqual(encode(expected))
  })
})
