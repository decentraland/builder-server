import { RequestParameters } from '../RequestParameters'
import { BaseAttributes } from './Searchable.types'
import {
  QueryString,
  ColumnName,
  Whitelist,
  ConditionName,
  Condition,
  Extra,
} from './SearchableConditions.types'

const DEFAULT_WHITELIST: Whitelist<BaseAttributes> = {
  eq: [],
  not_eq: [],
  includes: [],
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
    this.whitelist = DEFAULT_WHITELIST
    this.extras = {}

    if (whitelist) {
      this.whitelist = { ...this.whitelist, ...whitelist }
    }
  }

  sanitize() {
    return {
      eq: this.getEq(),
      notEq: this.getNotEq(),
      includes: this.getIncludes(),
    }
  }

  addExtras(conditionName: ConditionName, conditions: Condition<T>) {
    this.extras[conditionName] = {
      ...this.extras[conditionName],
      ...conditions,
    }
  }

  removeExtra(
    conditionName: ConditionName,
    conditionNamesToRemove: (keyof Condition<T>)[]
  ) {
    for (const conditionNameToRemove of conditionNamesToRemove) {
      if (this.extras[conditionName] === undefined) {
        continue
      }

      delete this.extras[conditionName]![conditionNameToRemove]
    }
  }

  private getCondition(name: ConditionName): Condition<T> {
    return {
      ...this.getSanitizedCondition(name),
      ...this.extras[name],
    }
  }

  private getEq(): Condition<T> {
    return this.getCondition('eq')
  }

  private getNotEq(): Condition<T> {
    return this.getCondition('not_eq')
  }

  private getIncludes(): Condition<T> {
    return this.getCondition('includes')
  }

  private getSanitizedCondition(conditionName: ConditionName) {
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

  private isWhitelisted(conditionName: ConditionName, columnName: string) {
    const finding = this.whitelist[conditionName].find(
      (value) => value === columnName
    )
    return !!finding
  }
}
