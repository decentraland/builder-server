import { removeEmojis } from '.'

describe('when removing emojis from a string that has 2 ⚡️', () => {
  it('should return a string without the ⚡️s', () => {
    const result = removeEmojis('⚡️ VOLTZ ⚡️ Genesis Drop #ØØ')
    const expected = ' VOLTZ  Genesis Drop #ØØ'

    const encode = (text: string) =>
      new TextEncoder().encodeInto(text, new Uint8Array())

    expect(encode(result)).toEqual(encode(expected))
  })
})
