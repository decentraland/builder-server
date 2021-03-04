export enum Network {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
}

export const FACTORY_COLLECTION_ADDRESS = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]: '0x0657fA4a3B14E568b0D9D49910D2875C5B6620F0',
}

export const FACTORY_COLLECTION_CODE_HASH = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]:
    '0x9ac4948955f04134f33bda446b161eb8aeb1d21d6940a0c765795a09220c9b8f',
}
