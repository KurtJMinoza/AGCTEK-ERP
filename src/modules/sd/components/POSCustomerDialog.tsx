'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import NumericInput from '@/components/shared/NumericInput'
import Select from '@/components/ui/Select'

export type PosCustomerDetails = {
    name: string
    contactName?: string
    email?: string
    phone?: string
    customerAccountType: 'NON_CREDIT' | 'CREDIT'
    creditLimit?: number
}

type Props = {
    isOpen: boolean
    saving?: boolean
    /** Called with the form values; rejects when the customer cannot be saved. */
    onSave: (details: PosCustomerDetails) => Promise<void>
    onClose: () => void
}

const ACCOUNT_TYPE_OPTIONS = [
    { value: 'NON_CREDIT', label: 'Non-credit customer (cash)' },
    { value: 'CREDIT', label: 'Credit customer (limit)' },
]

/**
 * Customer form of the register: a customer who is not in the Customer Master
 * yet. The record is created in the master and linked to the running sale.
 */
const POSCustomerDialog = ({ isOpen, saving = false, onSave, onClose }: Props) => {
    const [name, setName] = useState('')
    const [contactName, setContactName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [accountType, setAccountType] = useState<'NON_CREDIT' | 'CREDIT'>(
        'NON_CREDIT',
    )
    const [creditLimit, setCreditLimit] = useState('0')
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        const clean = name.trim()
        if (!clean) {
            setError('Enter the customer name.')
            return
        }
        if (accountType === 'CREDIT' && Number(creditLimit || 0) <= 0) {
            setError('A credit customer needs a credit limit.')
            return
        }
        setError(null)
        try {
            await onSave({
                name: clean,
                contactName: contactName.trim() || undefined,
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                customerAccountType: accountType,
                creditLimit:
                    accountType === 'CREDIT'
                        ? Number(creditLimit || 0)
                        : undefined,
            })
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to add the customer.',
            )
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={520}
            aria={{ labelledby: 'pos-customer-title' }}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 id="pos-customer-title" className="mb-1">
                Add customer
            </h5>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                The customer is added to the customer list and linked to this
                sale.
            </p>

            <div className="space-y-3">
                <div>
                    <label
                        htmlFor="pos-customer-name"
                        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                        Customer name
                    </label>
                    <Input
                        id="pos-customer-name"
                        autoFocus
                        placeholder="e.g. Maria Santos"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label
                            htmlFor="pos-customer-contact"
                            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                        >
                            Contact name
                        </label>
                        <Input
                            id="pos-customer-contact"
                            placeholder="Defaults to the name"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="pos-customer-phone"
                            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                        >
                            Phone
                        </label>
                        <Input
                            id="pos-customer-phone"
                            placeholder="Optional"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="pos-customer-email"
                        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                        Email
                    </label>
                    <Input
                        id="pos-customer-email"
                        type="email"
                        placeholder="Optional"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div>
                    <label
                        htmlFor="pos-customer-type"
                        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                        Account type
                    </label>
                    <Select<{ value: string; label: string }>
                        id="pos-customer-type"
                        options={ACCOUNT_TYPE_OPTIONS}
                        value={
                            ACCOUNT_TYPE_OPTIONS.find(
                                (option) =>
                                    option.value === accountType,
                            ) ?? null
                        }
                        onChange={(option) =>
                            setAccountType(
                                (option?.value as
                                    | 'NON_CREDIT'
                                    | 'CREDIT') ?? 'NON_CREDIT',
                            )
                        }
                    />
                </div>

                {accountType === 'CREDIT' ? (
                    <div>
                        <label
                            htmlFor="pos-customer-limit"
                            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                        >
                            Credit limit
                        </label>
                        <NumericInput
                            id="pos-customer-limit"
                            thousandSeparator=","
                            decimalScale={2}
                            fixedDecimalScale
                            allowNegative={false}
                            value={creditLimit}
                            onValueChange={(v) =>
                                setCreditLimit(v.value ?? '0')
                            }
                        />
                    </div>
                ) : null}

                {error ? (
                    <div
                        role="alert"
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                    >
                        {error}
                    </div>
                ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" onClick={onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    loading={saving}
                    onClick={() => void submit()}
                >
                    Add customer
                </Button>
            </div>
        </Dialog>
    )
}

export default POSCustomerDialog
