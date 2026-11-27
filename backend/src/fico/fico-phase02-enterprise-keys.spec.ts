import {
    FICO_PHASE02_REQUIRED_LOGICAL_KEYS,
    ficoCanonicalTransactionKeyCode,
    ficoCatalogEntryForLogicalKey,
    ficoTransactionKeysEqual,
    ficoTransactionKeyLookupCodes,
} from './fico-phase02-enterprise-keys.policy'
import { ficoCatalogEntryForKey } from './fico-account-determination-policy'

describe('FICO Phase 02 enterprise transaction keys', () => {
    it('resolves every Phase 02 logical key to a catalogue entry', () => {
        for (const key of FICO_PHASE02_REQUIRED_LOGICAL_KEYS) {
            expect(ficoCatalogEntryForLogicalKey(key)).toBeDefined()
            expect(ficoCatalogEntryForKey(key)).toBeDefined()
        }
    })

    it('canonicalizes legacy aliases deterministically', () => {
        expect(ficoCanonicalTransactionKeyCode('GRIR')).toBe('GR_IR')
        expect(ficoCanonicalTransactionKeyCode('AP_RECON')).toBe('SUPPLIER_RECON')
        expect(ficoCanonicalTransactionKeyCode('INPUT_VAT')).toBe('INPUT_TAX')
        expect(ficoCanonicalTransactionKeyCode('MATERIAL_CONSUMPTION')).toBe(
            'CONSUMPTION_EXPENSE',
        )
    })

    it('matches rules across alias codes', () => {
        const codes = ficoTransactionKeyLookupCodes('GRIR')
        expect(codes).toContain('GR_IR')
        expect(codes).toContain('GRIR')
        expect(ficoTransactionKeysEqual('GR_IR', 'GRIR')).toBe(true)
    })
})