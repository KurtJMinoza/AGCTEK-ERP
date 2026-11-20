import {
    barcodeZeroVariants,
    findWithZeroTolerance,
} from './barcode-zero-variants'

describe('barcodeZeroVariants', () => {
    it('adds the leading zero a spreadsheet dropped from a UPC-A (11 → 12 digits)', () => {
        expect(barcodeZeroVariants('62600061546')).toContain('062600061546')
    })

    it('strips the leading zero a scanner reads in front of a stored code', () => {
        const forms = barcodeZeroVariants('062600061546')
        expect(forms).toContain('62600061546')
        expect(forms).toContain('0062600061546') // EAN-13 form of the same UPC-A
    })

    it('treats an EAN-13 reading of a 12-digit UPC-A as the same code', () => {
        expect(barcodeZeroVariants('0020968656767')).toContain('020968656767')
        expect(barcodeZeroVariants('020968656767')).toContain('0020968656767')
    })

    it('never returns the scanned value itself', () => {
        expect(barcodeZeroVariants('062600061546')).not.toContain('062600061546')
    })

    it('leaves non-numeric, short and over-long codes alone', () => {
        expect(barcodeZeroVariants('SKU-000123')).toEqual([])
        expect(barcodeZeroVariants('A0123456789')).toEqual([])
        expect(barcodeZeroVariants('000123')).toEqual([])
        expect(barcodeZeroVariants('0123')).toEqual([])
        expect(barcodeZeroVariants('12345678901234567')).toEqual([])
    })
})

describe('findWithZeroTolerance', () => {
    it('returns the exact match without trying other forms', async () => {
        const find = jest.fn().mockResolvedValueOnce({ id: 'exact' })
        await expect(findWithZeroTolerance('062600061546', find)).resolves.toEqual({ id: 'exact' })
        expect(find).toHaveBeenCalledTimes(1)
        expect(find).toHaveBeenCalledWith('062600061546')
    })

    it('falls back to the zero-stripped stored form on a miss', async () => {
        const find = jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'stored-without-zero' })
        const hit = await findWithZeroTolerance(' 062600061546 ', find)
        expect(hit).toEqual({ id: 'stored-without-zero' })
        expect(find).toHaveBeenNthCalledWith(1, '062600061546')
        const second = find.mock.calls[1][0] as { in: string[] }
        expect(second.in).toContain('62600061546')
    })

    it('does not run a second query for codes with no alternates', async () => {
        const find = jest.fn().mockResolvedValue(null)
        await expect(findWithZeroTolerance('SKU-000123', find)).resolves.toBeNull()
        expect(find).toHaveBeenCalledTimes(1)
    })
})
