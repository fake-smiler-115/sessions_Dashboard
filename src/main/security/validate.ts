import { z } from 'zod'

export function validateArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args)
  if (!result.success) {
    throw new Error(`Invalid IPC arguments: ${result.error.issues.map((issue) => issue.message).join('; ')}`)
  }
  return result.data
}
