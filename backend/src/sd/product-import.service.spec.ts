import * as XLSX from 'xlsx'
import { ProductImportService } from './product-import.service'

function workbook(rows: Record<string, unknown>[]) {
    const sheet = XLSX.utils.json_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Products')
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
}

function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
        company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
        sdProductImportBatch: {
            create: jest.fn().mockResolvedValue({ id: 'b1' }),
            findUnique: jest.fn().mockResolvedValue({
                id: 'b1',
                status: 'PREVIEW',
                rows: [],
            }),
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        sdProductImportRow: {
            findMany: jest.fn().mockResolvedValue([
                { status: 'VALID', action: 'CREATE_MATERIAL', errors: null },
                { status: 'INVALID', action: null, errors: { errors: ['Barcode appears twice in this file'] } },
            ]),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        mmMaterial: { findFirst: jest.fn().mockResolvedValue(null) },
        mmBarcode: { findFirst: jest.fn().mockResolvedValue(null) },
        sdProductVariant: { findFirst: jest.fn().mockResolvedValue(null) },
        warehouse: { findFirst: jest.fn().mockResolvedValue(null) },
        wmStorageBin: { findFirst: jest.fn().mockResolvedValue(null) },
        mmMaterialCategory: {
            findFirst: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Beverages' }),
        },
        mmUom: { findFirst: jest.fn().mockResolvedValue({ id: 'uom-1', code: 'PCS' }) },
        mmMaterialType: { findFirst: jest.fn().mockResolvedValue({ id: 'type-1' }) },
        $transaction: jest.fn(),
        ...overrides,
    }
}

describe('ProductImportService', () => {
    const materials = { createWithClient: jest.fn(), postImportOpeningStock: jest.fn() }
    const productFamily = { createProductFamily: jest.fn() }

    beforeEach(() => jest.clearAllMocks())

    it('builds a template with every canonical column', () => {
        const service = new ProductImportService(
            makePrisma() as any,
            materials as any,
            productFamily as any,
        )
        const book = XLSX.read(service.template(), { type: 'buffer' })
        const rows = XLSX.utils.sheet_to_json<unknown[]>(
            book.Sheets[book.SheetNames[0]],
            { header: 1 },
        )
        const headers = rows[0] as string[]
        expect(headers).toEqual([
            'ItemName',
            'UM',
            'Category',
            'Available',
            'Barcode',
            'Cost',
            'Price',
        ])
    })

    it('accepts alternate column names ItemName and UM', () => {
        const service = new ProductImportService(
            makePrisma() as any,
            materials as any,
            productFamily as any,
        )
        const buffer = workbook([
            {
                ItemName: 'Vitamin C',
                UM: 'PCS',
                Barcode: '4809990000001',
                Category: 'Vitamins',
                Available: 'TRUE',
                Cost: '100',
                Price: '199.5',
            },
        ])
        // preview only validates header mapping; rows are classified in commit.
        const rows = service['readWorkbook'](buffer)
        expect(rows[0].productName).toBe('Vitamin C')
        expect(rows[0].uom).toBe('PCS')
        expect(rows[0].barcode).toBe('4809990000001')
        expect(rows[0].category).toBe('Vitamins')
        expect(rows[0].unitCost).toBe('100')
        expect(rows[0].srp).toBe('199.5')
    })

    it('accepts a row without SRP and Unit Cost columns', () => {
        const service = new ProductImportService(
            makePrisma() as any,
            materials as any,
            productFamily as any,
        )
        const buffer = workbook([
            {
                'Material SKU': 'NEW-1',
                Barcode: '4809990000002',
                'Product Name': 'No Price Item',
                Category: 'Vitamins',
                'Unit of Measure': 'PCS',
            },
        ])
        const rows = service['readWorkbook'](buffer)
        expect(rows[0].productName).toBe('No Price Item')
        expect(rows[0].srp).toBeUndefined()
        expect(rows[0].unitCost).toBeUndefined()
    })

    it('flags a barcode repeated inside the same file', async () => {
        const prisma = makePrisma()
        const service = new ProductImportService(
            prisma as any,
            materials as any,
            productFamily as any,
        )
        const buffer = workbook([
            {
                'Material SKU': 'NEW-1',
                Barcode: '11112222',
                'Product Name': 'Product A',
                Category: 'Beverages',
                'Unit of Measure': 'PCS',
                SRP: 10,
            },
            {
                'Material SKU': 'NEW-2',
                Barcode: '11112222',
                'Product Name': 'Product B',
                Category: 'Beverages',
                'Unit of Measure': 'PCS',
                SRP: 12,
            },
        ])

        await service.preview({
            buffer,
            filename: 'products.xlsx',
            companyId: 'c1',
            divisionId: 'DIV_RETAIL',
        })

        const created = prisma.sdProductImportBatch.create.mock.calls[0][0]
        const rows = created.data.rows.create
        expect(rows).toHaveLength(2)
        expect(rows[0].status).toBe('VALID')
        expect(rows[0].action).toBe('CREATE_MATERIAL')
        expect(rows[1].status).toBe('INVALID')
        expect(JSON.stringify(rows[1].errors)).toContain(
            'Barcode appears twice in this file',
        )
    })

    it('rejects a row where the SKU and barcode belong to different materials', async () => {
        const prisma = makePrisma({
            mmMaterial: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'm1',
                    sku: 'SKU-A',
                    materialCode: 'MAT-1',
                    materialName: 'Material A',
                    companyId: 'c1',
                    standardCost: 0,
                    materialCategory: null,
                    baseUom: null,
                }),
            },
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'bc1',
                    materialId: 'm2',
                    material: {
                        id: 'm2',
                        sku: 'SKU-B',
                        materialCode: 'MAT-2',
                        materialName: 'Material B',
                        companyId: 'c1',
                        materialCategory: null,
                    },
                }),
            },
        })
        const service = new ProductImportService(
            prisma as any,
            materials as any,
            productFamily as any,
        )
        const buffer = workbook([
            {
                'Material SKU': 'SKU-A',
                Barcode: '99998888',
                'Product Name': 'Material A',
                SRP: 10,
            },
        ])

        await service.preview({
            buffer,
            filename: 'products.xlsx',
            companyId: 'c1',
            divisionId: 'DIV_RETAIL',
        })

        const rows =
            prisma.sdProductImportBatch.create.mock.calls[0][0].data.rows.create
        expect(rows[0].status).toBe('INVALID')
        expect(JSON.stringify(rows[0].errors)).toContain('SKU conflict')
        expect(JSON.stringify(rows[0].errors)).toContain('MAT-2')
    })

    it('does not re-run an already committed batch', async () => {
        const prisma = makePrisma({
            sdProductImportBatch: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'b1',
                    status: 'COMMITTED',
                    rows: [{ id: 'r1', status: 'IMPORTED' }],
                }),
                updateMany: jest.fn(),
                update: jest.fn(),
            },
        })
        const service = new ProductImportService(
            prisma as any,
            materials as any,
            productFamily as any,
        )
        const batch = await service.commit('b1')
        expect(batch.status).toBe('COMMITTED')
        expect(prisma.sdProductImportBatch.updateMany).not.toHaveBeenCalled()
    })
})
