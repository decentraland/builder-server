import { shorten } from './address'

describe('when shortening an address', () => {
  it('should return the first and last digits of the address between ...', () => {
    expect(shorten('0xbebe680855A6Ce0250899f8DE99F1EE9CC025823')).toBe(
      '0xbebe...25823'
    )
  })

  it('should return an empty string if the address is empty', () => {
    expect(shorten('')).toBe('')
  })

  it('should return an empty string if the address is just spaces empty', () => {
    expect(shorten('                   ')).toBe('')
  })

  it('should return an empty string if the address length is not 42', () => {
    expect(shorten('nope, not here')).toBe('')
  })
})
