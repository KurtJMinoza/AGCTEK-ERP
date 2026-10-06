'use client'

import { createPortal } from 'react-dom'
import Button from '@/components/ui/Button'
import { HiOutlinePrinter } from 'react-icons/hi'
import ReceivingReceiptSlip, {
    type ReceivingReceiptSlipData,
} from './ReceivingReceiptSlip'

type ReceivingReceiptPanelProps = {
    data: ReceivingReceiptSlipData
    /** Mount print-only copy when this panel is the active print target. */
    enablePrintPortal?: boolean
    onPrint?: () => void
    title?: string
    className?: string
}

/** On-screen receipt preview + print button + optional print portal. */
const ReceivingReceiptPanel = ({
    data,
    enablePrintPortal = false,
    onPrint,
    title = 'Receipt',
    className,
}: ReceivingReceiptPanelProps) => (
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
                    Print receipt
                </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-900/40">
                <ReceivingReceiptSlip data={data} />
            </div>
        </div>
        {enablePrintPortal && typeof document !== 'undefined'
            ? createPortal(
                  <div className="print-isolate hidden print:block">
                      <ReceivingReceiptSlip data={data} />
                  </div>,
                  document.body,
              )
            : null}
    </>
)

export default ReceivingReceiptPanel
