import { FicoDocumentNumberingService } from './fico-document-numbering.service'

describe('FicoDocumentNumberingService', () => {
    it('formats official document numbers with fiscal year', async () => {
        const tx = {
            ficoDocumentSequence: {
                upsert: jest.fn().mockResolvedValue({
                    prefix: 'JE-2026-',
                    nextNumber: 1,
                    padding: 6,
                }),
            },
        }
        const service = new FicoDocumentNumberingService()
        const number = await service.allocateInTransaction(tx as never, {
            companyId: 'c1',
            documentType: 'JOURNAL',
            fiscalYear: 2026,
        })
        expect(number).toBe('JE-2026-000001')
    })
})