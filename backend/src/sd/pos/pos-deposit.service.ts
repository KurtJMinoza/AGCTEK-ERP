import { BadRequestException, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { SdEventEmitterService } from '../sd-event-emitter.service'
import { SD_EVENTS } from '../sd-event.types'
import { PosPaymentMethodService } from './pos-payment-method.service'
import { allocateTenders, setDynamicMethodCodes, type PosTenderInput } from './pos-tender'
import type { PosDepositDto } from './dto/pos.dto'

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

@Injectable()
export class PosDepositService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly sdEvents: SdEventEmitterService,
        private readonly paymentMethods: PosPaymentMethodService,
    ) {}

    async recordDeposit(dto: PosDepositDto) {
        const companyId = dto.companyId?.trim()
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        const customerId = dto.customerId?.trim()
        if (!customerId || customerId === 'WALK-IN') {
            throw new BadRequestException(
                'A customer deposit requires an identified customer.',
            )
        }
        const amountDue = round2(dto.depositAmount)
        if (!Number.isFinite(amountDue) || amountDue <= 0) {
            throw new BadRequestException('depositAmount must be positive.')
        }
        const methods = await this.paymentMethods.list(true)
        setDynamicMethodCodes(methods.map((m) => m.code))
        const tenders = allocateTenders(
            amountDue,
            (dto.tenders ?? []) as PosTenderInput[],
        ).tenders

        const depositId = randomUUID()
        const reference = dto.reference?.trim() || `DEP-${depositId.slice(0, 8).toUpperCase()}`
        const idempotencyKey =
            dto.idempotencyKey?.trim() || `pos-deposit:${depositId}`

        await this.sdEvents.emit(SD_EVENTS.POS_CUSTOMER_DEPOSIT, {
            depositId,
            reference,
            companyId,
            branchId: dto.branchId ?? null,
            customerId,
            currency: dto.currency?.trim() || 'PHP',
            depositAmount: amountDue.toFixed(2),
            tenders: tenders.map((t) => ({
                method: t.method,
                amount: t.amount.toFixed(2),
            })),
            idempotencyKey,
        })

        return {
            depositId,
            reference,
            companyId,
            customerId,
            depositAmount: amountDue,
            currency: dto.currency?.trim() || 'PHP',
        }
    }
}