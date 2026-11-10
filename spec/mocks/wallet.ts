import { Wallet as EthersWallet } from 'ethers'
import { Bytes } from '@ethersproject/bytes'
import { Signer } from '@ethersproject/abstract-signer'
import { Authenticator, AuthLinkType, AuthIdentity } from '@dcl/crypto'

export type Wallet = {
  address: string
  identity: AuthIdentity
}

// Mock wallet with a valid identity that lasts until 2036. Useful for making authorized requests to the server.
// Signer private key 0x22…22 (ephemeral 0x11…11); regenerate with `createIdentity` when it expires. Kept apart
// from `fakePrivateKey`, which the integration specs use as a wallet that owns nothing.
export const wallet: Wallet = {
  address: '0x1563915e194d8cfba1943570603f7606a3115508',
  identity: {
    ephemeralIdentity: {
      address: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
      publicKey:
        '0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1',
      privateKey:
        '0x1111111111111111111111111111111111111111111111111111111111111111',
    },
    expiration: new Date('2036-11-01T15:09:28.171Z'),
    authChain: [
      {
        type: AuthLinkType.SIGNER,
        payload: '0x1563915e194D8CfBA1943570603F7606A3115508',
        signature: '',
      },
      {
        type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        payload:
          'Decentraland Login\nEphemeral address: 0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A\nExpiration: 2036-11-01T15:09:28.171Z',
        signature:
          '0xc52057ba544358aa4263a57e8dfc874bc05ee08fca99b44375f21b3689a182dd4c9156448d8a269812ee2af74eba99596548b6a3fabe87948d38981d1268e4751c',
      },
    ],
  },
}

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
