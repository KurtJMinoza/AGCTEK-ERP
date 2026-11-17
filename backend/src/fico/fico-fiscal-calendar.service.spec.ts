import { BadRequestException, ConflictException } from '@nestjs/common'
import {
    FicoFiscalCalendarService,
    fiscalYearEndDay,
} from './fico-fiscal-calendar.service'

type GeneratedPeriod = {
    periodNumber: number
    name: string
    periodType: string
    startDate: Date
    endDate: Date
}

function calendarService() {
    return new FicoFiscalCalendarService({} as never, {} as never, {} as never)
}

function build(
    fiscalYear: number,
    startMonth: number,
    startDay: number,
    normalPeriodCount: number,
    specialPeriodCount: number,
    yearAssignment?: string,
) {
    return (
        calendarService() as unknown as {
            buildPeriods: (
                year: number,
                month: number,
                day: number,
                normal: number,
                special: number,
                yearAssignment?: string,
            ) => GeneratedPeriod[]
        }
    ).buildPeriods(
        fiscalYear,
        startMonth,
        startDay,
        normalPeriodCount,
        specialPeriodCount,
        yearAssignment,
    )
}

const iso = (date: Date) => date.toISOString().slice(0, 10)

describe('FicoFiscalCalendarService period generation', () => {
    it('includes leap day in a calendar-year February period', () => {
        const periods = build(2024, 1, 1, 12, 0)

        expect(periods[1]).toMatchObject({ periodNumber: 2, periodType: 'NORMAL' })
        expect(periods[1].startDate.toISOString().slice(0, 10)).toBe('2024-02-01')
        expect(periods[1].endDate.toISOString().slice(0, 10)).toBe('2024-02-29')
    })

    it('preserves a non-calendar fiscal-year boundary and clamps month end safely', () => {
        const periods = build(2024, 4, 30, 12, 0)

        expect(periods[0].startDate.toISOString().slice(0, 10)).toBe('2024-04-30')
        expect(periods[0].endDate.toISOString().slice(0, 10)).toBe('2024-05-29')
        expect(periods[11].endDate.toISOString().slice(0, 10)).toBe('2025-04-29')
    })

    it('adds year-end special periods without creating additional calendar ranges', () => {
        const periods = build(2026, 1, 1, 12, 2)

        expect(periods).toHaveLength(14)
        expect(periods.slice(12)).toEqual([
            expect.objectContaining({
                periodNumber: 13,
                periodType: 'SPECIAL',
                isYearEndAdjustment: true,
            }),
            expect.objectContaining({
                periodNumber: 14,
                periodType: 'SPECIAL',
                isYearEndAdjustment: true,
            }),
        ])
        expect(periods[12].startDate).toEqual(periods[11].startDate)
        expect(periods[12].endDate).toEqual(periods[11].endDate)
    })

    it('generates the AGCTEK_FY 2027 calendar month by month with month names', () => {
        const periods = build(2027, 1, 1, 12, 0)

        expect(periods).toHaveLength(12)
        expect(periods.map((period) => period.name)).toEqual([
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December',
        ])
        expect(periods.map((period) => [iso(period.startDate), iso(period.endDate)])).toEqual([
            ['2027-01-01', '2027-01-31'],
            ['2027-02-01', '2027-02-28'],
            ['2027-03-01', '2027-03-31'],
            ['2027-04-01', '2027-04-30'],
            ['2027-05-01', '2027-05-31'],
            ['2027-06-01', '2027-06-30'],
            ['2027-07-01', '2027-07-31'],
            ['2027-08-01', '2027-08-31'],
            ['2027-09-01', '2027-09-30'],
            ['2027-10-01', '2027-10-31'],
            ['2027-11-01', '2027-11-30'],
            ['2027-12-01', '2027-12-31'],
        ])
    })

    it('generates February 29 in a leap fiscal year', () => {
        const periods = build(2028, 1, 1, 12, 0)
        expect(iso(periods[1].endDate)).toBe('2028-02-29')
    })

    it('labels an April–March year by its start year with YEAR_START', () => {
        const periods = build(2027, 4, 1, 12, 0, 'YEAR_START')
        expect(iso(periods[0].startDate)).toBe('2027-04-01')
        expect(periods[0].name).toBe('April')
        expect(iso(periods[11].endDate)).toBe('2028-03-31')
        expect(periods[11].name).toBe('March')
    })

    it('labels an April–March year by its end year with YEAR_END', () => {
        const periods = build(2028, 4, 1, 12, 0, 'YEAR_END')
        expect(iso(periods[0].startDate)).toBe('2027-04-01')
        expect(iso(periods[11].endDate)).toBe('2028-03-31')
        expect(periods.every((period) => period.periodNumber > 0)).toBe(true)
    })

    it('treats YEAR_END like YEAR_START for a January 1 calendar year', () => {
        expect(build(2027, 1, 1, 12, 0, 'YEAR_END')).toEqual(build(2027, 1, 1, 12, 0))
    })

    it('generates contiguous quarterly periods covering the whole year', () => {
        const periods = build(2027, 4, 1, 4, 0)
        expect(periods.map((period) => [iso(period.startDate), iso(period.endDate)])).toEqual([
            ['2027-04-01', '2027-06-30'],
            ['2027-07-01', '2027-09-30'],
            ['2027-10-01', '2027-12-31'],
            ['2028-01-01', '2028-03-31'],
        ])
        expect(periods[0].name).toBe('Period 01')
    })

    it('rejects zero, uneven and excessive period configurations', () => {
        expect(() => build(2027, 1, 1, 0, 0)).toThrow(BadRequestException)
        expect(() => build(2027, 1, 1, 5, 0)).toThrow(BadRequestException)
        expect(() => build(2027, 1, 1, 13, 0)).toThrow(BadRequestException)
        expect(() => build(2027, 1, 1, 12, 5)).toThrow(BadRequestException)
    })

    it('rejects an impossible start date', () => {
        expect(() => build(2027, 2, 30, 12, 0)).toThrow(BadRequestException)
        expect(() => build(2027, 13, 1, 12, 0)).toThrow(BadRequestException)
    })

    it('derives the fiscal year end from its start', () => {
        expect(fiscalYearEndDay(1, 1)).toEqual({ endMonth: 12, endDay: 31 })
        expect(fiscalYearEndDay(4, 1)).toEqual({ endMonth: 3, endDay: 31 })
    })

    it('previews a saved variant without persisting periods', async () => {
        const findUnique = jest.fn().mockResolvedValue({
            id: 'apr-mar',
            startMonth: 4,
            startDay: 1,
            normalPeriodCount: 12,
            specialPeriodCount: 0,
            yearAssignment: 'YEAR_END',
        })
        const service = new FicoFiscalCalendarService(
            { ficoFiscalYearVariant: { findUnique } } as never,
            {} as never,
            {} as never,
        )
        const preview = await service.previewFiscalYear({
            fiscalYear: 2028,
            fiscalYearVariantId: 'apr-mar',
        })
        expect(preview).toMatchObject({ periodType: 'MONTHLY', yearAssignment: 'YEAR_END' })
        expect(iso(preview.startDate)).toBe('2027-04-01')
        expect(iso(preview.endDate)).toBe('2028-03-31')
        expect(preview.periods).toHaveLength(12)
    })

    it('rejects a duplicate variant code', async () => {
        const service = new FicoFiscalCalendarService(
            {
                ficoFiscalYearVariant: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
                },
            } as never,
            {} as never,
            {} as never,
        )
        await expect(
            service.createFiscalVariant(
                { code: 'agctek_fy', name: 'AGCTEK', startMonth: 1, startDay: 1 },
                { id: 'user-1' } as never,
            ),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('protects the calendar structure of a variant that already generated periods', async () => {
        const service = new FicoFiscalCalendarService(
            {
                ficoFiscalYearVariant: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'v1',
                        startMonth: 1,
                        startDay: 1,
                        normalPeriodCount: 12,
                        specialPeriodCount: 4,
                        yearAssignment: 'YEAR_START',
                        status: 'ACTIVE',
                    }),
                    update: jest.fn(),
                },
                ficoFinancialPeriod: { count: jest.fn().mockResolvedValue(16) },
            } as never,
            {} as never,
            {} as never,
        )
        await expect(
            service.updateFiscalVariant(
                'v1',
                { yearAssignment: 'YEAR_END' },
                { id: 'user-1' } as never,
            ),
        ).rejects.toThrow(/cannot change after periods have been generated/)
        await expect(
            service.updateFiscalVariant('v1', { startMonth: 4 }, { id: 'user-1' } as never),
        ).rejects.toThrow(/cannot change after periods have been generated/)
    })

    it('requires generation to use the company-assigned fiscal configuration', async () => {
        const service = new FicoFiscalCalendarService(
            {
                ficoCompanyAccountingSettings: {
                    findUnique: jest.fn().mockResolvedValue({
                        fiscalYearVariantId: 'assigned-fiscal',
                        postingPeriodVariantId: 'assigned-posting',
                    }),
                },
            } as never,
            { assertAccess: jest.fn().mockResolvedValue(undefined) } as never,
            {} as never,
        )

        await expect(
            service.generateFiscalYear(
                {
                    companyId: 'company-1',
                    fiscalYear: 2026,
                    fiscalYearVariantId: 'other-fiscal',
                    postingPeriodVariantId: 'assigned-posting',
                },
                { id: 'user-1' } as never,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})
