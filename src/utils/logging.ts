import { ILoggerComponent } from '@well-known-components/interfaces'
import { v4 as uuidv4 } from 'uuid'

export const logExecutionTime = async <T>(
  functionToMeasure: () => T | Promise<T>,
  logger: ILoggerComponent.ILogger,
  name: string,
  tracer: string = uuidv4()
): Promise<T> => {
  const start = process.hrtime.bigint()
  logger.info(`[${tracer}] Performing ${name}`)
  const result = await functionToMeasure()
  const end = process.hrtime.bigint()
  logger.info(
    `[${tracer ?? 'no-tracer'}] ${name} took ${
      (end - start) / BigInt(1000000)
    } ms to run`
  )
  return result
}
