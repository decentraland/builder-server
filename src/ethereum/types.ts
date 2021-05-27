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
  [Network.ROPSTEN]: '0x2c3212deae0554e253e91cba2b36a6ee888483c6',
}

export const FORWARDER_CONTRACT_ADDRESS = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]: '0x0053e887b0f73e3aed2973968d5e85f33d305cbd',
}
