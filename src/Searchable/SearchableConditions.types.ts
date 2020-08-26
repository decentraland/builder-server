export type QueryString = Record<string, any>

export type ColumnName<T> = keyof T

export type Whitelist<T> = {
  eq: ColumnName<T>[]
  not_eq: ColumnName<T>[]
  includes: ColumnName<T>[]
}

export type ConditionName = keyof Whitelist<any>
export type Condition<T> = Partial<Record<ColumnName<T>, any>>

export type Extra<T> = Record<ConditionName, Condition<T>>
