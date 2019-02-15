import { env } from 'decentraland-commons'
import crypto = require('crypto')

const ALGORITHM = 'aes-192-ctr'
const KEY_SIZE = 24
const SECRET = env.get('SERVER_SECRET', '')

if (!SECRET) {
  console.warn('Server secret undefined. Encryption will be disabled')
}

export async function encrypt(text: string) {
  if (!SECRET) {
    return text
  }
  const key = await crypto.scryptSync(ALGORITHM, SECRET, KEY_SIZE)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const crypted = cipher.update(text, 'utf8', 'hex')
  return concatIV(crypted + cipher.final('hex'), iv)
}

export async function decrypt(encryptedText: string) {
  if (!SECRET) {
    return encryptedText
  }
  const key = await crypto.scryptSync(ALGORITHM, SECRET, KEY_SIZE)
  const [text, iv] = extractIV(encryptedText)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  const decrypted = decipher.update(text, 'hex', 'utf8')
  return decrypted + decipher.final('utf8')
}

function concatIV(text: string, iv: Buffer): string {
  return text + '-' + iv.toString('base64')
}

function extractIV(text: string): [string, Buffer] {
  const [realText, iv] = text.split('-')
  return [realText, Buffer.from(iv, 'base64')]
}
