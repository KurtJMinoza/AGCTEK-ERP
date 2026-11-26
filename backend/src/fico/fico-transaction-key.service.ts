import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAuditService } from './fico-audit.service'
import {
    FICO_TRANSACTION_KEY_CATALOG,
    type FicoTransactionKeyCatalogEntry,
} from './fico-transaction-key.catalog'
import {
    FICO_DETERMINATION_AUDIT_ACTIONS,
    FICO_TRANSACTION_KEY_ENTITY_TYPE,
} from './fico-account-determination.constants'
import {
    FICO_DETERMINATION_ERROR_CODES,
    FicoDeterminationError,
} from './fico-determination-error'

export type TransactionKeyWriteInput = {
    code?: string
    name?: string
    description?: string
    owningModule?: string
    accountingCategory?: string
    supportedSourceModules?: string[]
    requiresValuationClass?: boolean
    inventorySide?: string
    automaticPostingEligible?: boolean
    integrationStatus?: string
    sortOrder?: number
    status?: string
}

const SELECT = {
    id: true,
    code: true,
    name: true,
    description: true,
    owningModule: true,
    accountingCategory: true,
    supportedSourceModules: true,
    requiresValuationClass: true,
    inventorySide: true,
    automaticPostingEligible: true,
    systemDefined: true,
    integrationStatus: true,
    sortOrder: true,
    status: true,
    createdAt: true,
    updatedAt: true,
} as const

@Injectable()
export class FicoTransactionKeyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: FicoAuditService,
    ) {}

    catalog(): FicoTransactionKeyCatalogEntry[] {
        return FICO_TRANSACTION_KEY_CATALOG
    }

    /**
     * Upsert system-defined transaction keys from the Phase 04 catalogue.
     * Does not delete or rename keys referenced by mappings/rules.
     */
    async syncCatalogFromCode(user?: AuthRequestUser): Promise<{ upserted: number }> {
        let upserted = 0
        for (const row of FICO_TRANSACTION_KEY_CATALOG) {
            await this.prisma.ficoTransactionKey.upsert({
                where: { code: row.code },
                create: this.toRow(row),
                update: {
                    name: row.name,
                    description: row.description,
                    owningModule: row.owningModule,
                    accountingCategory: row.accountingCategory,
                    supportedSourceModules: row.supportedSourceModules,
                    requiresValuationClass: row.requiresValuationClass,
                    inventorySide: row.inventorySide,
                    automaticPostingEligible: row.automaticPostingEligible,
                    systemDefined: row.systemDefined,
                    integrationStatus: row.integrationStatus,
                    sortOrder: row.sortOrder,
                    status: 'ACTIVE',
                },
            })
            upserted += 1
        }
        if (user) {
            await this.audit.log({
                actorId: user.id,
                action: FICO_DETERMINATION_AUDIT_ACTIONS.TRANSACTION_KEY_SYNC,
                entityType: FICO_TRANSACTION_KEY_ENTITY_TYPE,
                newValues: { upserted },
                metadata: { correlationId: randomUUID() },
            })
        }
        return { upserted }
    }

    async listPersisted() {
        return this.prisma.ficoTransactionKey.findMany({
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        })
    }

    async getOne(idOrCode: string) {
        const key = await this.prisma.ficoTransactionKey.findFirst({
            where: {
                OR: [{ id: idOrCode }, { code: idOrCode.trim().toUpperCase() }],
            },
            select: SELECT,
        })
        if (!key) {
            throw new FicoDeterminationError(
                FICO_DETERMINATION_ERROR_CODES.TRANSACTION_KEY_INVALID,
                `Transaction key ${idOrCode} does not exist.`,
                {
                    transactionKey: idOrCode,
                    remediation:
                        'Sync the enterprise catalogue or create a custom transaction key first.',
                },
            )
        }
        const catalogEntry = FICO_TRANSACTION_KEY_CATALOG.find(
            (entry) => entry.code === key.code,
        )
        return { ...key, catalogEntry: catalogEntry ?? null }
    }

    /** Custom (non system-defined) keys only. */
    async create(input: TransactionKeyWriteInput, user: AuthRequestUser) {
        const code = input.code?.trim().toUpperCase()
        if (!code) {
            throw new BadRequestException('A transaction key code is required.')
        }
        if (FICO_TRANSACTION_KEY_CATALOG.some((entry) => entry.code === code)) {
            throw new ConflictException(
                `${code} is a system-defined transaction key. Use the catalogue sync instead.`,
            )
        }
        const existing = await this.prisma.ficoTransactionKey.findUnique({
            where: { code },
            select: { id: true },
        })
        if (existing) {
            throw new ConflictException(`Transaction key ${code} already exists.`)
        }
        const created = await this.prisma.ficoTransactionKey.create({
            data: {
                code,
                name: input.name?.trim() || code,
                description: input.description ?? '',
                owningModule: input.owningModule?.trim().toUpperCase() ?? 'FICO',
                accountingCategory:
                    input.accountingCategory?.trim().toUpperCase() ?? 'CLEARING',
                supportedSourceModules: input.supportedSourceModules ?? [],
                requiresValuationClass: input.requiresValuationClass ?? false,
                inventorySide: input.inventorySide ?? 'NONE',
                automaticPostingEligible: input.automaticPostingEligible ?? false,
                systemDefined: false,
                integrationStatus: input.integrationStatus ?? 'CONFIG_ONLY',
                sortOrder: input.sortOrder ?? 900,
                status: 'ACTIVE',
            },
            select: SELECT,
        })
        await this.audit.log({
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.TRANSACTION_KEY_CREATE,
            entityType: FICO_TRANSACTION_KEY_ENTITY_TYPE,
            entityId: created.id,
            newValues: created as unknown as Record<string, unknown>,
            metadata: { correlationId: randomUUID() },
        })
        return created
    }

    /**
     * System-defined keys only accept operational toggles (status,
     * integrationStatus, sortOrder); their accounting semantics stay in code.
     */
    async update(
        idOrCode: string,
        input: TransactionKeyWriteInput,
        user: AuthRequestUser,
    ) {
        const current = await this.prisma.ficoTransactionKey.findFirst({
            where: {
                OR: [{ id: idOrCode }, { code: idOrCode.trim().toUpperCase() }],
            },
        })
        if (!current) throw new NotFoundException('Transaction key not found.')

        const semanticFields: Array<keyof TransactionKeyWriteInput> = [
            'code',
            'owningModule',
            'accountingCategory',
            'supportedSourceModules',
            'requiresValuationClass',
            'inventorySide',
            'automaticPostingEligible',
        ]
        if (current.systemDefined) {
            const attempted = semanticFields.filter(
                (field) => input[field] !== undefined,
            )
            if (attempted.length) {
                throw new BadRequestException(
                    `${current.code} is system-defined. ${attempted.join(', ')} cannot be changed from the API; update the enterprise catalogue in code.`,
                )
            }
        }

        const updated = await this.prisma.ficoTransactionKey.update({
            where: { id: current.id },
            data: {
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined
                    ? { description: input.description }
                    : {}),
                ...(input.status !== undefined
                    ? { status: input.status.trim().toUpperCase() }
                    : {}),
                ...(input.integrationStatus !== undefined
                    ? { integrationStatus: input.integrationStatus.trim().toUpperCase() }
                    : {}),
                ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
                ...(!current.systemDefined
                    ? {
                          ...(input.owningModule !== undefined
                              ? { owningModule: input.owningModule.trim().toUpperCase() }
                              : {}),
                          ...(input.accountingCategory !== undefined
                              ? {
                                    accountingCategory:
                                        input.accountingCategory.trim().toUpperCase(),
                                }
                              : {}),
                          ...(input.supportedSourceModules !== undefined
                              ? { supportedSourceModules: input.supportedSourceModules }
                              : {}),
                          ...(input.requiresValuationClass !== undefined
                              ? { requiresValuationClass: input.requiresValuationClass }
                              : {}),
                          ...(input.inventorySide !== undefined
                              ? { inventorySide: input.inventorySide }
                              : {}),
                          ...(input.automaticPostingEligible !== undefined
                              ? {
                                    automaticPostingEligible:
                                        input.automaticPostingEligible,
                                }
                              : {}),
                      }
                    : {}),
            },
            select: SELECT,
        })

        await this.audit.log({
            actorId: user.id,
            action: FICO_DETERMINATION_AUDIT_ACTIONS.TRANSACTION_KEY_UPDATE,
            entityType: FICO_TRANSACTION_KEY_ENTITY_TYPE,
            entityId: updated.id,
            previousValues: {
                name: current.name,
                status: current.status,
                integrationStatus: current.integrationStatus,
                sortOrder: current.sortOrder,
            },
            newValues: updated as unknown as Record<string, unknown>,
            metadata: { correlationId: randomUUID(), systemDefined: current.systemDefined },
        })
        return updated
    }

    private toRow(row: FicoTransactionKeyCatalogEntry) {
        return {
            code: row.code,
            name: row.name,
            description: row.description,
            owningModule: row.owningModule,
            accountingCategory: row.accountingCategory,
            supportedSourceModules: row.supportedSourceModules,
            requiresValuationClass: row.requiresValuationClass,
            inventorySide: row.inventorySide,
            automaticPostingEligible: row.automaticPostingEligible,
            systemDefined: row.systemDefined,
            integrationStatus: row.integrationStatus,
            sortOrder: row.sortOrder,
            status: 'ACTIVE' as const,
        }
    }
}