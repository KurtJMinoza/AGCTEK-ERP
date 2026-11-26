import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import {
    FICO_JOURNAL_DOCUMENT_TYPE_CODE_MAP,
    FICO_STANDARD_DOCUMENT_TYPE_CODES,
    formatFicoNumber,
} from './fico.constants'

type Tx = Omit<
    Prisma.TransactionClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

@Injectable()
export class FicoDocumentNumberingService {
    resolveTypeCode(documentType: string): string {
        const normalized = documentType.trim().toUpperCase()
        return (
            FICO_JOURNAL_DOCUMENT_TYPE_CODE_MAP[normalized] ??
            FICO_JOURNAL_DOCUMENT_TYPE_CODE_MAP[documentType] ??
            (normalized.length <= 4 ? normalized : FICO_STANDARD_DOCUMENT_TYPE_CODES.JE)
        )
    }

    /**
     * Allocate an official number: `{TYPE}-{fiscalYear}-{sequence}` e.g. JE-2026-000001
     * Sequence is per company + documentType + fiscal year (gaps allowed).
     */
    async allocateInTransaction(
        tx: Tx,
        input: {
            companyId: string
            documentType: string
            fiscalYear: number
            padding?: number
        },
    ): Promise<string> {
        const typeCode = this.resolveTypeCode(input.documentType)
        const prefix = `${typeCode}-${input.fiscalYear}-`
        const padding = input.padding ?? 6
        const sequence = await tx.ficoDocumentSequence.upsert({
            where: {
                companyId_documentType_fiscalYear: {
                    companyId: input.companyId,
                    documentType: input.documentType,
                    fiscalYear: input.fiscalYear,
                },
            },
            create: {
                companyId: input.companyId,
                documentType: input.documentType,
                fiscalYear: input.fiscalYear,
                prefix,
                nextNumber: 1,
                padding,
            },
            update: {
                nextNumber: { increment: 1 },
                prefix,
                padding,
            },
        })
        return formatFicoNumber(prefix, sequence.nextNumber, sequence.padding, '')
    }
}