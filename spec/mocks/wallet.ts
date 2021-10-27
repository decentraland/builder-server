import { AuthLinkType, AuthIdentity } from 'dcl-crypto'

export type Wallet = {
  address: string
  identity: AuthIdentity
}

// Mock wallet with a valid identity that lasts until 2026. Useful for making authorized requests to the server
export const wallet: Wallet = {
  address: '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd9',
  identity: {
    ephemeralIdentity: {
      address: '0x00d1244305653Be915D066d39d4c6b54808e59a9',
      publicKey:
        '0x043e17ed6a1e1ea903660fb0be36f841c808aff2a595f9b3e3a3caaf970dbb197bd91e414a945ebd27beb478ab85c361127d2e807d014626035881348ccaf69281',
      privateKey:
        '0x91ee230307805931ac133b16a3eae41eeb404c8e16436ade9ea07d736217f8fb',
    },
    expiration: new Date('2026-11-01T19:27:26.452Z'),
    authChain: [
      {
        type: AuthLinkType.SIGNER,
        payload: '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd9',
        signature: '',
      },
      {
        type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        payload:
          'Decentraland Login\nEphemeral address: 0x00d1244305653Be915D066d39d4c6b54808e59a9\nExpiration: 2026-11-01T19:27:26.452Z',
        signature:
          '0x22fa60a6f0c5b979524b6ceea6318ca4491ddd831efa7d60369546f2b66f38383014d262c5ce4e4b859298fe1bc992d990909389d7f6cb5c765d17f9ae2118101b',
      },
    ],
  },
}
