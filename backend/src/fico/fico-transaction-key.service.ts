import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
    FICO_TRANSACTION_KEY_CATALOG,
    type FicoTransactionKeyCatalogEntry,
} from './fico-transaction-key.catalog'

@Injectable()
export class FicoTransactionKeyService {
    constructor(private readonly prisma: PrismaService) {}

    catalog(): FicoTransactionKeyCatalogEntry[] {
        return FICO_TRANSACTION_KEY_CATALOG
    }

    /**
     * Upsert system-defined transaction keys from the Phase 04 catalogue.
     * Does not delete or rename keys referenced by mappings/rules.
     */
    async syncCatalogFromCode(): Promise<{ upserted: number }> {
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
        return { upserted }
    }

    async listPersisted() {
        return this.prisma.ficoTransactionKey.findMany({
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        })
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