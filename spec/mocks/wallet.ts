import { Wallet as EthersWallet } from 'ethers'
import { Bytes } from '@ethersproject/bytes'
import { Signer } from '@ethersproject/abstract-signer'
import { Authenticator, AuthLinkType, AuthIdentity } from '@dcl/crypto'

export type Wallet = {
  address: string
  identity: AuthIdentity
}

// Mock wallet with a valid identity that lasts until the end of 2099. Useful for making authorized requests to the server.
// Test-only keys: the signer's private key is 0xc4fa97485f42da57c67006559ed95bae823e23e0f74ac3e2889fde0825b3470d, which
// signs a new ephemeral link if this one ever needs to change.
export const wallet: Wallet = {
  address: '0x41abbd52906f3a5f600d74844c4e8bb8bd5cbcc3',
  identity: {
    ephemeralIdentity: {
      address: '0x71B5bE76782e2CA244E8a332f6CaC0E3d8054bcf',
      publicKey:
        '0x04e70a499e02504a137b6c39dae5e4a17c476151d14775b1dc3b931d2e97ca7175f780b60b971eb4721ced74a8ba939320ab2436037a52359a9c3fb31a5c03d190',
      privateKey:
        '0xd559a5c12322cd7fb9c3d3f4ab44f414714770172d84e876d46711e8e83dce3d',
    },
    expiration: new Date('2099-12-31T23:59:59.000Z'),
    authChain: [
      {
        type: AuthLinkType.SIGNER,
        payload: '0x41abbd52906f3a5f600d74844c4e8bb8bd5cbcc3',
        signature: '',
      },
      {
        type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        payload:
          'Decentraland Login\nEphemeral address: 0x71B5bE76782e2CA244E8a332f6CaC0E3d8054bcf\nExpiration: 2099-12-31T23:59:59.000Z',
        signature:
          '0x02a7b4e00cbafc4b36f2d3297625793a334eaec1020a76b05fb6ae1e9810fa240067046e020675f3db89e7591253dee4f33fe07c94d511e8db47d4e207c4b9591b',
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
