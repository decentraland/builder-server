import { RequestParameters } from '../RequestParameters'
import { BaseAttributes } from './Searchable.types'

type QueryString = Record<string, any>
type Whitelist<T> = {
  eq: (keyof T)[]
  not_eq: (keyof T)[]
}
type PartialWhitelist<T> = Partial<Whitelist<T>>

const DEAFAULT_WHITELIST: Whitelist<BaseAttributes> = {
  eq: [],
  not_eq: []
}

export class SearchableConditions<T> {
  requestParameters: RequestParameters
  queryString: QueryString
  whitelist: Whitelist<T>

  constructor(
    requestParameters: RequestParameters,
    whitelist?: PartialWhitelist<T>
  ) {
    this.requestParameters = requestParameters
    this.queryString = requestParameters.getQueryString()
    this.whitelist = DEAFAULT_WHITELIST

    if (whitelist) {
      this.whitelist = { ...this.whitelist, ...whitelist }
    }
  }

  sanitize() {
    return {
      eq: this.getEq(),
      notEq: this.getNotEq()
    }
  }

  private getEq() {
    return this.getSanitizedCondition('eq')
  }

  private getNotEq() {
    return this.getSanitizedCondition('not_eq')
  }

  private getSanitizedCondition(name: keyof Whitelist<T>) {
    const condition: QueryString = {}
    const queryStringName = `_${name}`

    for (const key in this.queryString) {
      if (key.endsWith(queryStringName)) {
        const columnName = key.replace(queryStringName, '')
        if (this.isWhitelisted(columnName, name)) {
          condition[columnName] = this.queryString[key]
        }
      }
    }

    return condition
  }

  private isWhitelisted(columnName: string, whitelistKey: keyof Whitelist<T>) {
    const finding = this.whitelist[whitelistKey].find(
      value => value === columnName
    )
    return !!finding
  }
}
