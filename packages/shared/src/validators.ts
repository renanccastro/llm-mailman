import { z } from 'zod';

export const EmailSchema = z.string().email();

export const CreateRequestSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'BOTH']),
  message: z.string().min(1).max(10000),
  repositoryId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        mimetype: z.string(),
        size: z.number().positive(),
        url: z.string().url().optional(),
      }),
    )
    .optional(),
});

export const ConfirmRequestSchema = z.object({
  requestId: z.string().cuid(),
  token: z.string(),
  confirmationType: z.enum(['EMAIL', 'WHATSAPP']),
});

export const UpdateUserPreferencesSchema = z.object({
  yoloMode: z.boolean().optional(),
  notificationChannel: z.enum(['EMAIL', 'WHATSAPP', 'BOTH']).optional(),
  timezone: z.string().optional(),
  ipWhitelist: z.array(z.string().ip()).optional(),
  twoFactorEnabled: z.boolean().optional(),
});

export const CreateApiTokenSchema = z.object({
  name: z.string().min(1).max(100),
  service: z.enum(['anthropic', 'openai', 'custom']),
  token: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['createdAt', 'updatedAt', 'name']).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const ContainerConfigSchema = z.object({
  memoryLimit: z.number().int().positive().max(8192).optional(),
  cpuLimit: z.number().positive().max(4).optional(),
  diskLimit: z.number().int().positive().max(102400).optional(),
  environment: z.record(z.string()).optional(),
  volumes: z
    .array(
      z.object({
        source: z.string(),
        target: z.string(),
        readonly: z.boolean().optional(),
      }),
    )
    .optional(),
});

export type CreateRequestDto = z.infer<typeof CreateRequestSchema>;
export type ConfirmRequestDto = z.infer<typeof ConfirmRequestSchema>;
export type UpdateUserPreferencesDto = z.infer<typeof UpdateUserPreferencesSchema>;
export type CreateApiTokenDto = z.infer<typeof CreateApiTokenSchema>;
export type PaginationDto = z.infer<typeof PaginationSchema>;
export type ContainerConfigDto = z.infer<typeof ContainerConfigSchema>;