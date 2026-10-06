'use client'

import { createPortal } from 'react-dom'
import Button from '@/components/ui/Button'
import { HiOutlinePrinter } from 'react-icons/hi'
import SupplierInvoiceSlip, {
    type SupplierInvoiceSlipData,
} from './SupplierInvoiceSlip'

type SupplierInvoicePrintPanelProps = {
    data: SupplierInvoiceSlipData
    enablePrintPortal?: boolean
    onPrint?: () => void
    title?: string
    className?: string
}

const SupplierInvoicePrintPanel = ({
    data,
    enablePrintPortal = false,
    onPrint,
    title = 'Supplier invoice slip',
    className,
}: SupplierInvoicePrintPanelProps) => (
    <>
        <div className={className}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h6 className="text-sm font-semibold heading-text">{title}</h6>
                <Button
                    size="sm"
                    variant="solid"
                    icon={<HiOutlinePrinter />}
                    onClick={onPrint ?? (() => window.print())}
                >
                    Print invoice
                </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-900/40">
                <SupplierInvoiceSlip data={data} />
            </div>
        </div>
        {enablePrintPortal && typeof document !== 'undefined'
            ? createPortal(
                  <div className="print-isolate hidden print:block">
                      <SupplierInvoiceSlip data={data} />
                  </div>,
                  document.body,
              )
            : null}
    </>
)

export default SupplierInvoicePrintPanel
