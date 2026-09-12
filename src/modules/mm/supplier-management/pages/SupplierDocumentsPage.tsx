'use client'

import { useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import SupplierDocumentsPanel from '../components/SupplierDocumentsPanel'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/supplier-management/supplier-documents'

const SupplierDocumentsPage = () => {
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)
    const [supplierId, setSupplierId] = useState('')
    const { options: supplierOpts } = useSupplierOptions({ enabled: true })

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbs} />
            <PageHeader
                title="Supplier Documents"
                description="Upload, view, and manage supplier contracts, certificates, and compliance files."
            />
            <AdaptiveCard>
                <div className="mb-4 max-w-md">
                    <FormItem label="Supplier">
                        <Select
                            isSearchable
                            placeholder="Select supplier…"
                            options={supplierOpts}
                            value={
                                supplierOpts.find((o) => o.value === supplierId) ??
                                null
                            }
                            onChange={(opt: { value: string } | null) =>
                                setSupplierId(opt?.value ?? '')
                            }
                        />
                    </FormItem>
                </div>

                {supplierId ? (
                    <SupplierDocumentsPanel supplierId={supplierId} />
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Select a supplier to manage documents.
                    </p>
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}

export default SupplierDocumentsPage
