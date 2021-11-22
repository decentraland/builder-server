import { ILoggerComponent } from '@well-known-components/interfaces'

export const logExecutionTime = async <T>(
  functionToMeasure: () => T | Promise<T>,
  logger: ILoggerComponent.ILogger,
  name: string,
  tracer?: string
): Promise<T> => {
  const start = process.hrtime.bigint()
  const result = await functionToMeasure()
  const end = process.hrtime.bigint()
  logger.info(
    `[${tracer ?? 'no-tracer'}] ${name} took ${
      (end - start) / BigInt(1000000)
    } ms to run`
  )
  return result
}
