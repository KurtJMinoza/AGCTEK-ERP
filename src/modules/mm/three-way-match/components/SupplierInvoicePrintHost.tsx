'use client'

import { createPortal } from 'react-dom'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import { HiOutlinePrinter } from 'react-icons/hi'
import SupplierInvoiceSlip, {
    type SupplierInvoiceSlipData,
} from './SupplierInvoiceSlip'

type SupplierInvoicePrintHostProps = {
    slip: SupplierInvoiceSlipData | null
    onClose: () => void
}

/** Print portal + preview dialog — slip content only here, not in the view modal. */
export function SupplierInvoicePrintHost({
    slip,
    onClose,
}: SupplierInvoicePrintHostProps) {
    return (
        <>
            {slip && typeof document !== 'undefined'
                ? createPortal(
                      <div className="print-isolate hidden print:block">
                          <SupplierInvoiceSlip data={slip} />
                      </div>,
                      document.body,
                  )
                : null}

            <FormDialog
                    isOpen={slip !== null}
                    onClose={onClose}
                    size="sm"
                    title="Print supplier invoice"
                    icon={<HiOutlinePrinter />}
                    footer={
                        <>
                            <Button size="sm" onClick={onClose}>Close</Button>
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlinePrinter />}
                                onClick={() => window.print()}
                            >
                                Print invoice
                            </Button>
                        </>
                    }
                >
                    {slip ? (
                        <div className="max-h-[70vh] overflow-y-auto rounded border border-gray-200 dark:border-gray-600">
                            <SupplierInvoiceSlip data={slip} />
                        </div>
                    ) : null}
                </FormDialog>
        </>
    )
}
