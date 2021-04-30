export enum Network {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
}

export const FACTORY_COLLECTION_CODE_HASH = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]:
    '0xb5b5b44c3ea9413e94e7b28af51d8cb84fd5c85643fbd9ec08a61e2a6f0886c8',
}

export const FACTORY_COLLECTION_ADDRESS = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]: '0x2C3212DEae0554E253e91cBa2B36A6ee888483C6',
}

export const FORWARDER_CONTRACT_ADDRESS = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]: '0x0053e887b0F73e3aED2973968d5e85F33d305cbD',
}
