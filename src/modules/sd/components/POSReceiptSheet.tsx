import { TbScissors } from 'react-icons/tb'
import type { PosReceipt as PosReceiptData } from '../services/posService'
import POSReceipt from './POSReceipt'

type POSReceiptSheetProps = {
    receipt: PosReceiptData
    /** Selected branch name (MM Organization Branch) when available. */
    branchName?: string | null
    /** Optional name printed under "Checked By" on both copies. */
    checkedByName?: string | null
}

/**
 * One A4 sheet with the sales receipt printed twice (top and bottom half) and
 * a cut line between them, so the sheet is cut in two and each party keeps a
 * copy.
 *
 * The `data-receipt-*` markers are read by `printPosReceipt`, which fits each
 * copy into its half of the page (and puts the copies on separate pages when
 * a sale has too many lines to share one sheet).
 */
const POSReceiptSheet = ({
    receipt,
    branchName,
    checkedByName,
}: POSReceiptSheetProps) => (
    <div data-receipt-sheet className="mx-auto w-full max-w-[190mm] bg-white">
        {[0, 1].map((copy) => (
            <div key={copy}>
                {copy === 1 ? (
                    <div
                        data-receipt-cut
                        aria-hidden
                        className="relative flex items-center justify-center py-2"
                    >
                        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-black" />
                        <span className="relative inline-flex items-center gap-1 bg-white px-2 text-[9px] font-semibold uppercase tracking-[0.25em] text-black">
                            <TbScissors className="text-[13px]" />
                            Cut here
                        </span>
                    </div>
                ) : null}
                <section data-receipt-copy>
                    <div data-receipt-copy-inner className="mx-auto w-full">
                        <POSReceipt
                            receipt={receipt}
                            branchName={branchName}
                            checkedByName={checkedByName}
                            compact
                            className="!max-w-none"
                        />
                    </div>
                </section>
            </div>
        ))}
    </div>
)

export default POSReceiptSheet
