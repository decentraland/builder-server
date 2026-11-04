import { Wallet as EthersWallet, utils } from 'ethers'
import { Bytes } from '@ethersproject/bytes'
import { Signer } from '@ethersproject/abstract-signer'
import { Authenticator, AuthLinkType, AuthIdentity } from '@dcl/crypto'

export type Wallet = {
  address: string
  identity: AuthIdentity
}

// Some suites move `Date.now` a day or more ahead (lock expirations) while they sign requests.
const IDENTITY_TTL_MS = 365 * 24 * 60 * 60 * 1000

/**
 * A wallet with an identity signed when the module loads, for making authorized requests to the server. Both keys are
 * generated for each test run and never leave it: no key is kept in the repository and the identity cannot expire.
 * The signature is computed synchronously, as `Authenticator.initializeAuthChain` would, so mocks can read the address
 * at import time.
 */
function createTestWallet(): Wallet {
  const signer = new EthersWallet(utils.randomBytes(32))
  const ephemeral = new EthersWallet(utils.randomBytes(32))
  const address = signer.address.toLowerCase()
  const expiration = new Date(Date.now() + IDENTITY_TTL_MS)
  const ephemeralMessage = `Decentraland Login\nEphemeral address: ${
    ephemeral.address
  }\nExpiration: ${expiration.toISOString()}`
  const signature = utils.joinSignature(
    new utils.SigningKey(signer.privateKey).signDigest(
      utils.hashMessage(ephemeralMessage)
    )
  )

  return {
    address,
    identity: {
      ephemeralIdentity: {
        address: ephemeral.address,
        publicKey: ephemeral.publicKey,
        privateKey: ephemeral.privateKey,
      },
      expiration,
      authChain: [
        { type: AuthLinkType.SIGNER, payload: address, signature: '' },
        {
          type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
          payload: ephemeralMessage,
          signature,
        },
      ],
    },
  }
}

export const wallet: Wallet = createTestWallet()

// Taken from https://github.com/decentraland/builder-client/blob/00ab26cdbd350ce5f5a46da09358c3662c4c6741/src/test-utils/crypto.ts#L1
// Wallet address: 0x63FaC9201494f0bd17B9892B9fae4d52fe3BD377
export const fakePrivateKey =
  '8da4ef21b864d2cc526dbdb2a120bd2874c36c9d0a1fb7f8c63d7f7a8b41de8f'

// Taken from https://github.com/decentraland/builder-client/blob/8f38031e2d5fe119764ebf46ff8c1a20260764ff/src/client/identity.ts#L11.
// TODO: Unify this somewhere so we don't have it repeated
/**
 * Creates an identity to later be used in the IAuthentication implementation.
 * @param signer - Any Ethereum signer (RPC or Wallet signer).
 * @param expiration - TTL in seconds of the identity.
 */
export async function createIdentity(
  wallet: EthersWallet,
  signer: Signer,
  expiration: number
): Promise<AuthIdentity> {
  const address = await signer.getAddress()

  const payload = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
  }

  const identity = await Authenticator.initializeAuthChain(
    address,
    payload,
    expiration,
    (message: string | Bytes) => signer.signMessage(message)
  )

  return identity
}
