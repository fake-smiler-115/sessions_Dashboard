import { z } from 'zod'

const browserId = z.enum(['chrome', 'arc', 'brave', 'edge', 'firefox', 'safari'])
const category = z.enum(['cookies', 'localStorage', 'sessionStorage'])

export const PortableCookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  secure: z.boolean(),
  httpOnly: z.boolean(),
  sameSite: z.number(),
  session: z.boolean(),
  expiresUnix: z.number().optional()
})

export const PortableStorageRecordSchema = z.object({
  key: z.string(),
  value: z.string()
})

export const PortableSessionBundleSchema = z.object({
  format: z.literal('session-transfer-bundle'),
  version: z.literal(1),
  generatedAt: z.string(),
  source: z.object({
    browserId,
    origin: z.string().min(1),
    profileId: z.string().optional()
  }),
  categories: z.array(category).min(1),
  cookies: z.array(PortableCookieSchema),
  localStorage: z.array(PortableStorageRecordSchema),
  sessionStorage: z.array(PortableStorageRecordSchema)
})

export type ValidatedPortableSessionBundle = z.infer<typeof PortableSessionBundleSchema>
