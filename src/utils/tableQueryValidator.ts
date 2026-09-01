import { z } from 'zod'

export const querySchema = z.object({
    pageIndex: z.string().min(1),
    pageSize: z.string().min(1),
    query: z.string().optional(),
    order: z.string().optional(),
    sortKey: z.string().optional(),
})
