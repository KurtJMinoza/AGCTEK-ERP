import { NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'

/** Root client or an interactive transaction client. */
export type CrmPrismaClient = PrismaService | Prisma.TransactionClient

/** Selected on every CRM record that references the SD-owned customer master. */
export const CRM_CUSTOMER_SUMMARY_SELECT = {
    id: true,
    customerNumber: true,
    companyName: true,
    contactName: true,
    status: true,
    currency: true,
} as const

/** Display fields for users referenced by id (activity assignee, opportunity owner). */
export const CRM_USER_SUMMARY_SELECT = {
    id: true,
    userName: true,
    firstName: true,
    lastName: true,
} as const

/** CRM only references SdCustomer; it never creates or edits it. */
export async function assertCustomerExists(prisma: CrmPrismaClient, customerId: string) {
    const customer = await prisma.sdCustomer.findUnique({
        where: { id: customerId },
        select: { id: true },
    })
    if (!customer) throw new NotFoundException('Customer not found')
}

export async function assertUserExists(prisma: CrmPrismaClient, userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
    })
    if (!user) throw new NotFoundException('Assigned user not found')
}
