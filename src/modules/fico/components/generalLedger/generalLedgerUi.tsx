'use client'

export {
    JournalLineAmountCell as GeneralLedgerAmountCell,
    journalAmountColumnHeader as generalLedgerAmountHeader,
} from '../journal/journalUi'

export { FICO_TABLE_COL_RIGHT as GENERAL_LEDGER_AMOUNT_COL } from '../ficoTableUi'

export function humanizeLedgerDocType(value?: string) {
    if (!value) return 'Journal'
    return value.replace(/_/g, ' ')
}