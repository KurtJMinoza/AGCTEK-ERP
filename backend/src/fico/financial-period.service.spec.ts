import { FicoFinancialPeriodService } from './financial-period.service'

describe('FicoFinancialPeriodService', () => {
    const period = {
        id: 'period-1',
        companyId: 'company-1',
        fiscalYear: 2026,
        periodNumber: 9,
        periodType: 'NORMAL',
        status: 'OPEN',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
    }
    let periods: Array<typeof period>
    let controls: Array<{ status: string }>
    let service: FicoFinancialPeriodService

    beforeEach(() => {
        periods = []
        controls = []
        service = new FicoFinancialPeriodService({
            ficoFinancialPeriod: {
                findFirst: jest.fn(async () => periods[0] ?? null),
            },
            ficoPostingPeriodControl: {
                findMany: jest.fn(async () => controls),
            },
        } as never)
    })

    it('keeps the pre-FICO no-calendar path available', async () => {
        await expect(
            service.canPostToPeriod({
                companyId: 'company-1',
                postingDate: '2026-09-15',
            }),
        ).resolves.toEqual({ allowed: true, periodKey: undefined, reason: undefined })
    })

    it.each(['CLOSED', 'LOCKED', 'FUTURE'])(
        'blocks a %s fiscal period through the MM-facing port',
        async (status) => {
            periods = [{ ...period, status }]

            await expect(
                service.canPostToPeriod({
                    companyId: 'company-1',
                    postingDate: '2026-09-15',
                }),
            ).resolves.toMatchObject({ allowed: false, periodKey: '2026-09' })
        },
    )

    it('blocks an all-account control even if the period itself is open', async () => {
        periods = [period]
        controls = [{ status: 'LOCKED' }]

        await expect(
            service.canPostToPeriod({
                companyId: 'company-1',
                postingDate: '2026-09-15',
            }),
        ).resolves.toMatchObject({ allowed: false, periodKey: '2026-09' })
    })
})
