import { FICO_TRANSACTION_KEY_CATALOG } from './fico-transaction-key.catalog'
import { FICO_PHASE0416_TRANSACTION_KEYS } from './fico-treasury-payment-determination.policy'
import {
    FICO_PHASE0417_TRANSACTION_KEYS,
    FICO_PHASE0418_TRANSACTION_KEYS,
} from './fico-aa-account-determination.policy'
import { FICO_PHASE0419_TRANSACTION_KEYS } from './fico-pp-co-account-determination.policy'

const catalogCodes = new Set(FICO_TRANSACTION_KEY_CATALOG.map((entry) => entry.code))

describe('FICO transaction key catalogue Phase 04.16–04.19', () => {
    it('includes treasury payment keys as CONFIG_ONLY or LIVE', () => {
        for (const code of FICO_PHASE0416_TRANSACTION_KEYS) {
            const entry = FICO_TRANSACTION_KEY_CATALOG.find((row) => row.code === code)
            expect(entry).toBeDefined()
            expect(catalogCodes.has(code)).toBe(true)
            expect(entry?.integrationStatus).not.toBe('NOT_AVAILABLE')
        }
    })

    it('includes asset acquisition and depreciation keys', () => {
        for (const code of [
            ...FICO_PHASE0417_TRANSACTION_KEYS,
            ...FICO_PHASE0418_TRANSACTION_KEYS,
        ]) {
            expect(catalogCodes.has(code)).toBe(true)
            const entry = FICO_TRANSACTION_KEY_CATALOG.find((row) => row.code === code)
            expect(entry?.integrationStatus).toBe('CONFIG_ONLY')
        }
    })

    it('includes PP/CO production keys', () => {
        for (const code of FICO_PHASE0419_TRANSACTION_KEYS) {
            expect(catalogCodes.has(code)).toBe(true)
        }
    })
})