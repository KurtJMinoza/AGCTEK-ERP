import {
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateBankAccountDto } from './dto/create-bank-account.dto'

function maskAccountNumber(acct: string): string {
    if (acct.length <= 4) return '****'
    return '*'.repeat(acct.length - 4) + acct.slice(-4)
}

@Injectable()
export class SupplierBankService {
    constructor(private prisma: PrismaService) {}

    async findBySupplier(supplierId: string) {
        const accounts = await this.prisma.mmSupplierBankAccount.findMany({
            where: { supplierId },
            orderBy: { createdAt: 'desc' },
        })

        return accounts.map((a) => ({
            ...a,
            accountNumber: maskAccountNumber(a.accountNumber),
            iban: a.iban ? maskAccountNumber(a.iban) : null,
        }))
    }

    async reveal(id: string, performedBy?: string) {
        const account = await this.prisma.mmSupplierBankAccount.findUnique({ where: { id } })
        if (!account) throw new NotFoundException('Bank account not found')

        await this.prisma.mmSupplierAudit.create({
            data: {
                supplierId: account.supplierId,
                action: 'BANK_DATA_VIEWED',
                field: 'bankAccount',
                details: { accountId: id, bankName: account.bankName },
                performedBy: performedBy ?? null,
            },
        })

        return account
    }

    async create(supplierId: string, dto: CreateBankAccountDto, performedBy?: string) {
        const account = await this.prisma.mmSupplierBankAccount.create({
            data: {
                supplierId,
                bankName: dto.bankName,
                accountName: dto.accountName,
                accountNumber: dto.accountNumber,
                routingNumber: dto.routingNumber ?? null,
                swiftCode: dto.swiftCode ?? null,
                iban: dto.iban ?? null,
                currency: dto.currency ?? null,
                isPrimary: dto.isPrimary ?? false,
            },
        })

        await this.prisma.mmSupplierAudit.create({
            data: {
                supplierId,
                action: 'BANK_ACCOUNT_CREATED',
                field: 'bankAccount',
                newValue: JSON.stringify({ bankName: dto.bankName, accountName: dto.accountName }),
                performedBy: performedBy ?? null,
            },
        })

        return {
            ...account,
            accountNumber: maskAccountNumber(account.accountNumber),
        }
    }

    async update(id: string, dto: Partial<CreateBankAccountDto>, performedBy?: string) {
        const existing = await this.prisma.mmSupplierBankAccount.findUnique({ where: { id } })
        if (!existing) throw new NotFoundException('Bank account not found')

        const data: any = {}
        for (const [key, value] of Object.entries(dto)) {
            if (value !== undefined) data[key] = value
        }

        const updated = await this.prisma.mmSupplierBankAccount.update({
            where: { id },
            data,
        })

        await this.prisma.mmSupplierAudit.create({
            data: {
                supplierId: existing.supplierId,
                action: 'BANK_ACCOUNT_UPDATED',
                field: 'bankAccount',
                oldValue: JSON.stringify({ bankName: existing.bankName, accountName: existing.accountName }),
                newValue: JSON.stringify(data),
                performedBy: performedBy ?? null,
            },
        })

        return {
            ...updated,
            accountNumber: maskAccountNumber(updated.accountNumber),
        }
    }

    async delete(id: string, performedBy?: string) {
        const existing = await this.prisma.mmSupplierBankAccount.findUnique({ where: { id } })
        if (!existing) throw new NotFoundException('Bank account not found')

        await this.prisma.mmSupplierAudit.create({
            data: {
                supplierId: existing.supplierId,
                action: 'BANK_ACCOUNT_DELETED',
                field: 'bankAccount',
                oldValue: JSON.stringify({ bankName: existing.bankName, accountName: existing.accountName }),
                performedBy: performedBy ?? null,
            },
        })

        return this.prisma.mmSupplierBankAccount.delete({ where: { id } })
    }
}
