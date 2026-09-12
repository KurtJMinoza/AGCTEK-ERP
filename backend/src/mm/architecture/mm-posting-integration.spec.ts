import { postingKey, reversalKey } from '../common/idempotency.util'

describe('MM posting integration contracts', () => {
    it('postingKey is deterministic', () => {
        expect(postingKey('gr', 'doc-1', 'line-1', 'good')).toBe('gr:doc-1:line-1:good')
    })

    it('reversalKey defaults to reversal prefix', () => {
        expect(reversalKey('txn-abc')).toBe('reversal:txn-abc')
    })
})
