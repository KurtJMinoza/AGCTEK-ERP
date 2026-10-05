import type { SdProductRecord } from '../services/productCatalogService'
import type { CatalogStockSnapshot } from './productCatalogTableColors'
import { productDivisionLabel } from '../catalogs/productDivisions'

const escapeCsv = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
    return value
}

export function downloadProductCatalogCsv(
    products: SdProductRecord[],
    stockByProductId: Record<string, CatalogStockSnapshot>,
) {
    const header = [
        'SKU',
        'Name',
        'Division',
        'Category',
        'Price',
        'Original price',
        'Badge',
        'Visible',
        'Available qty',
        'Stock state',
    ]
    const rows = products.map((p) => {
        const stock = stockByProductId[p.id]
        return [
            p.sku,
            p.name,
            productDivisionLabel(p.divisionId),
            p.category,
            String(p.price),
            p.originalPrice == null ? '' : String(p.originalPrice),
            p.badge ?? '',
            p.isActive ? 'yes' : 'no',
            stock ? String(stock.availableQty) : '',
            stock?.state ?? '',
        ]
            .map(escapeCsv)
            .join(',')
    })
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `product-catalog-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
}
