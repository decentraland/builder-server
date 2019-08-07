import { RequestParameters } from '../RequestParameters'
import { BaseAttributes } from './Searchable.types'

type QueryString = Record<string, any>

type ColumnName<T> = keyof T

type Whitelist<T> = {
  eq: (ColumnName<T>)[]
  not_eq: (ColumnName<T>)[]
}

type ConditionName<T> = keyof Whitelist<T>
type Condition<T> = Partial<Record<ColumnName<T>, any>>

type Extra<T> = Record<ConditionName<T>, Condition<T>>

const DEAFAULT_WHITELIST: Whitelist<BaseAttributes> = {
  eq: [],
  not_eq: []
}

export class SearchableConditions<T> {
  requestParameters: RequestParameters
  private queryString: QueryString
  private whitelist: Whitelist<T>
  private extras: Partial<Extra<T>>

  constructor(
    requestParameters: RequestParameters,
    whitelist?: Partial<Whitelist<T>>
  ) {
    this.requestParameters = requestParameters
    this.queryString = requestParameters.getQueryString()
    this.whitelist = DEAFAULT_WHITELIST
    this.extras = {}

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

  addExtras(conditionName: ConditionName<T>, conditions: Condition<T>) {
    this.extras[conditionName] = {
      ...this.extras[conditionName],
      ...conditions
    }
  }

  removeExtra(
    conditionName: ConditionName<T>,
    conditionNamesToRemove: (keyof Condition<T>)[]
  ) {
    for (const conditionNameToRemove of conditionNamesToRemove) {
      if (this.extras[conditionName] === undefined) {
        continue
      }

      delete this.extras[conditionName]![conditionNameToRemove]
    }
  }

  private getEq(): Condition<T> {
    return {
      ...this.getSanitizedCondition('eq'),
      ...this.extras['eq']
    }
  }

  private getNotEq(): Condition<T> {
    return {
      ...this.getSanitizedCondition('not_eq'),
      ...this.extras['not_eq']
    }
  }

  private getSanitizedCondition(conditionName: ConditionName<T>) {
    const condition: Partial<Condition<T>> = {}
    const queryStringName = `_${conditionName}`

    for (const key in this.queryString) {
      if (key.endsWith(queryStringName)) {
        const columnName = key.replace(queryStringName, '')

        if (this.isWhitelisted(conditionName, columnName)) {
          condition[columnName as ColumnName<T>] = this.queryString[key]
        }
      }
    }

    return condition
  }

  private isWhitelisted(conditionName: ConditionName<T>, columnName: string) {
    const finding = this.whitelist[conditionName].find(
      value => value === columnName
    )
    return !!finding
  }
}
