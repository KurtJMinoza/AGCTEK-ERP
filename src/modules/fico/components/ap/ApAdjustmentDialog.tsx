'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import DatePicker from '@/components/ui/DatePicker'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import dayjs from 'dayjs'
import { accountsPayableService } from '../../services/accountsPayableService'
import type { CreateApAdjustmentInput, CreateApDirectInvoiceInput } from '../../types/accountsPayable'

type Mode = 'adjustment' | 'direct-invoice'

type Props = {
    companyId: string
    open: boolean
    onClose: () => void
    onSuccess: () => void
}

const docTypeOptions = [
    { value: 'CREDIT_MEMO', label: 'Credit memo' },
    { value: 'DEBIT_ADJUSTMENT', label: 'Debit adjustment' },
    { value: 'ADVANCE', label: 'Supplier advance' },
]

const invoiceKindOptions = [
    { value: 'EXPENSE_INVOICE', label: 'Expense invoice' },
    { value: 'NON_PO_INVOICE', label: 'Non-PO invoice' },
]

const ApAdjustmentDialog = ({ companyId, open, onClose, onSuccess }: Props) => {
    const [mode, setMode] = useState<Mode>('adjustment')
    const [supplierId, setSupplierId] = useState('')
    const [documentType, setDocumentType] = useState<CreateApAdjustmentInput['documentType']>(
        'CREDIT_MEMO',
    )
    const [invoiceKind, setInvoiceKind] =
        useState<CreateApDirectInvoiceInput['invoiceKind']>('EXPENSE_INVOICE')
    const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('')
    const [referenceNumber, setReferenceNumber] = useState('')
    const [amount, setAmount] = useState('')
    const [grossAmount, setGrossAmount] = useState('')
    const [taxAmount, setTaxAmount] = useState('')
    const [currencyCode, setCurrencyCode] = useState('PHP')
    const [reason, setReason] = useState('')
    const [documentDate, setDocumentDate] = useState<Date | null>(new Date())
    const [postingDate, setPostingDate] = useState<Date | null>(new Date())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!open) return
        setError('')
    }, [open])

    const submit = async () => {
        if (!supplierId.trim()) {
            setError('Supplier id is required.')
            return
        }
        if (!documentDate || !postingDate) {
            setError('Document and posting dates are required.')
            return
        }
        setLoading(true)
        setError('')
        try {
            if (mode === 'adjustment') {
                const parsed = Number(amount)
                if (!parsed || parsed <= 0) {
                    setError('Amount must be greater than zero.')
                    setLoading(false)
                    return
                }
                await accountsPayableService.postAdjustment({
                    companyId,
                    supplierId: supplierId.trim(),
                    documentType,
                    documentDate: dayjs(documentDate).format('YYYY-MM-DD'),
                    postingDate: dayjs(postingDate).format('YYYY-MM-DD'),
                    currencyCode: currencyCode.trim().toUpperCase(),
                    amount: parsed,
                    referenceNumber: referenceNumber.trim() || undefined,
                    reason: reason.trim() || undefined,
                })
            } else {
                const gross = Number(grossAmount)
                if (!supplierInvoiceNumber.trim()) {
                    setError('Supplier invoice number is required.')
                    setLoading(false)
                    return
                }
                if (!gross || gross <= 0) {
                    setError('Gross amount must be greater than zero.')
                    setLoading(false)
                    return
                }
                await accountsPayableService.postDirectSupplierInvoice({
                    companyId,
                    supplierId: supplierId.trim(),
                    invoiceKind,
                    supplierInvoiceNumber: supplierInvoiceNumber.trim(),
                    documentDate: dayjs(documentDate).format('YYYY-MM-DD'),
                    postingDate: dayjs(postingDate).format('YYYY-MM-DD'),
                    currencyCode: currencyCode.trim().toUpperCase(),
                    grossAmount: gross,
                    taxAmount: taxAmount.trim() ? Number(taxAmount) : undefined,
                    reason: reason.trim() || undefined,
                })
            }
            onSuccess()
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Post failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog isOpen={open} onClose={onClose} width={480}>
            <h4 className="mb-4 text-lg font-semibold">Post AP document</h4>
            {error ? <Alert className="mb-3" type="danger" showIcon title={error} /> : null}
            <div className="space-y-3">
                <FormItem label="Mode">
                    <Select
                        size="sm"
                        value={{ value: mode, label: mode === 'adjustment' ? 'Adjustment' : 'Direct invoice' }}
                        options={[
                            { value: 'adjustment', label: 'Credit / debit / advance' },
                            { value: 'direct-invoice', label: 'Expense or non-PO invoice' },
                        ]}
                        onChange={(opt) => opt && setMode(opt.value as Mode)}
                    />
                </FormItem>
                <FormItem label="Supplier id">
                    <Input
                        size="sm"
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        placeholder="From MM supplier master"
                    />
                </FormItem>
                {mode === 'adjustment' ? (
                    <>
                        <FormItem label="Document type">
                            <Select
                                size="sm"
                                value={docTypeOptions.find((o) => o.value === documentType)}
                                options={docTypeOptions}
                                onChange={(opt) =>
                                    opt &&
                                    setDocumentType(opt.value as CreateApAdjustmentInput['documentType'])
                                }
                            />
                        </FormItem>
                        <FormItem label="Amount">
                            <Input size="sm" value={amount} onChange={(e) => setAmount(e.target.value)} />
                        </FormItem>
                        <FormItem label="Reference">
                            <Input
                                size="sm"
                                value={referenceNumber}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                            />
                        </FormItem>
                    </>
                ) : (
                    <>
                        <FormItem label="Invoice kind">
                            <Select
                                size="sm"
                                value={invoiceKindOptions.find((o) => o.value === invoiceKind)}
                                options={invoiceKindOptions}
                                onChange={(opt) =>
                                    opt &&
                                    setInvoiceKind(
                                        opt.value as CreateApDirectInvoiceInput['invoiceKind'],
                                    )
                                }
                            />
                        </FormItem>
                        <FormItem label="Supplier invoice number">
                            <Input
                                size="sm"
                                value={supplierInvoiceNumber}
                                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                            />
                        </FormItem>
                        <FormItem label="Gross amount">
                            <Input
                                size="sm"
                                value={grossAmount}
                                onChange={(e) => setGrossAmount(e.target.value)}
                            />
                        </FormItem>
                        <FormItem label="Tax amount (optional)">
                            <Input size="sm" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
                        </FormItem>
                    </>
                )}
                <FormItem label="Currency">
                    <Input
                        size="sm"
                        className="max-w-[80px]"
                        value={currencyCode}
                        onChange={(e) => setCurrencyCode(e.target.value)}
                    />
                </FormItem>
                <div className="grid gap-3 sm:grid-cols-2">
                    <FormItem label="Document date">
                        <DatePicker value={documentDate} onChange={setDocumentDate} size="sm" />
                    </FormItem>
                    <FormItem label="Posting date">
                        <DatePicker value={postingDate} onChange={setPostingDate} size="sm" />
                    </FormItem>
                </div>
                <FormItem label="Reason / note">
                    <Input size="sm" value={reason} onChange={(e) => setReason(e.target.value)} />
                </FormItem>
            </div>
            <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="plain" onClick={onClose}>
                    Cancel
                </Button>
                <Button size="sm" variant="solid" loading={loading} onClick={() => void submit()}>
                    Post
                </Button>
            </div>
        </Dialog>
    )
}

export default ApAdjustmentDialog