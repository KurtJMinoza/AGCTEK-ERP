'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Alert from '@/components/ui/Alert'
import { treasuryService } from '../../services/treasuryService'

const ACCOUNT_KINDS = [
    'BANK',
    'CASH_ON_HAND',
    'BRANCH_CASH',
    'CASHIER_SETTLEMENT',
    'CARD_CLEARING',
    'EWALLET_CLEARING',
]

type Props = {
    companyId: string
    open: boolean
    onClose: () => void
    onSuccess: () => void
}

const TreasuryAccountDialog = ({ companyId, open, onClose, onSuccess }: Props) => {
    const [accountCode, setAccountCode] = useState('')
    const [accountName, setAccountName] = useState('')
    const [accountKind, setAccountKind] = useState('BANK')
    const [glAccountId, setGlAccountId] = useState('')
    const [currencyCode, setCurrencyCode] = useState('PHP')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const reset = () => {
        setAccountCode('')
        setAccountName('')
        setAccountKind('BANK')
        setGlAccountId('')
        setCurrencyCode('PHP')
        setError('')
    }

    const submit = async () => {
        if (!accountCode.trim() || !accountName.trim() || !glAccountId.trim()) {
            setError('Account code, name, and G/L account are required.')
            return
        }
        setLoading(true)
        setError('')
        try {
            await treasuryService.saveAccount({
                companyId,
                accountCode: accountCode.trim(),
                accountName: accountName.trim(),
                accountKind,
                glAccountId: glAccountId.trim(),
                currencyCode: currencyCode.trim().toUpperCase(),
            })
            reset()
            onSuccess()
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog isOpen={open} width={480} onClose={onClose} onRequestClose={onClose}>
            <h4 className="mb-1 text-lg font-semibold">New treasury account</h4>
            <p className="mb-4 text-sm text-gray-500">
                Link a bank or clearing account to a posting G/L account. No payment credentials
                are stored.
            </p>
            {error ? (
                <Alert showIcon className="mb-4" type="danger">
                    {error}
                </Alert>
            ) : null}
            <div className="space-y-4">
                <FormItem label="Account code">
                    <Input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} />
                </FormItem>
                <FormItem label="Display name">
                    <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                </FormItem>
                <FormItem label="Kind">
                    <Select
                        value={{ value: accountKind, label: accountKind }}
                        options={ACCOUNT_KINDS.map((k) => ({ value: k, label: k }))}
                        onChange={(opt) =>
                            setAccountKind((opt as { value: string } | null)?.value ?? 'BANK')
                        }
                    />
                </FormItem>
                <FormItem
                    label="G/L account id"
                    extra={
                        <span className="text-gray-500">Internal id from G/L master</span>
                    }
                >
                    <Input value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)} />
                </FormItem>
                <FormItem label="Currency">
                    <Input
                        value={currencyCode}
                        maxLength={3}
                        onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                    />
                </FormItem>
            </div>
            <div className="mt-6 flex justify-end gap-2">
                <Button variant="plain" onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="solid" loading={loading} onClick={() => void submit()}>
                    Save account
                </Button>
            </div>
        </Dialog>
    )
}

export default TreasuryAccountDialog