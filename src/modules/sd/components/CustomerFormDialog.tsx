'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HiOutlineOfficeBuilding } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import NumericInput from '@/components/shared/NumericInput'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import type {
    CreateCustomerInput,
    Customer,
    CustomerStatus,
    ShopAccount,
} from '../services/customerMasterService'
import { getShopAccounts } from '../services/customerMasterService'

const MAX_CREDIT_LIMIT = 999_999_999_999.99

const customerSchema = z.object({
    companyName: z.string().trim().min(2, 'At least 2 characters').max(200),
    contactName: z.string().trim().min(2, 'At least 2 characters').max(120),
    email: z.string().trim().email('Enter a valid email').max(200),
    phone: z.string().trim().max(40),
    creditLimit: z
        .number({ message: 'Credit limit is required' })
        .min(0, 'Cannot be negative')
        .max(MAX_CREDIT_LIMIT, 'Credit limit is too large')
        .optional(),
    password: z
        .string()
        .max(72)
        .regex(/[A-Za-z]/, 'Include at least one letter')
        .regex(/\d/, 'Include at least one number')
        .optional()
        .or(z.literal('')),
    status: z.enum(['ACTIVE', 'BLOCKED']),
})

type FormShape = z.infer<typeof customerSchema>
type StatusOption = { value: CustomerStatus; label: string }
type ShopAccountOption = { value: string; label: string }

const STATUS_OPTIONS: StatusOption[] = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'BLOCKED', label: 'Blocked' },
]

const FORM_ID = 'sd-customer-form'

const blankValues: FormShape = {
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    password: '',
    status: 'ACTIVE',
}

const toFormValues = (customer?: Customer | null): FormShape =>
    customer
        ? {
              companyName: customer.companyName,
              contactName: customer.contactName,
              email: customer.email,
              phone: customer.phone,
              creditLimit: customer.creditLimit,
              status: customer.status,
          }
        : blankValues

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

/** Shopping account label — includes a marker when already linked. */
const shopOptionLabel = (account: ShopAccount) =>
    `${account.fullName} — ${account.email}${
        account.linkedCustomer ? ` (linked: ${account.linkedCustomer.customerNumber})` : ''
    }`

type CustomerFormDialogProps = {
    isOpen: boolean
    mode: 'create' | 'edit'
    customer?: Customer | null
    saving?: boolean
    onClose: () => void
    onSubmit: (values: CreateCustomerInput) => void | Promise<void>
}

const CustomerFormDialog = ({
    isOpen,
    mode,
    customer,
    saving,
    onClose,
    onSubmit,
}: CustomerFormDialogProps) => {
    const {
        control,
        handleSubmit,
        reset,
        setValue,
        formState: { errors },
    } = useForm<FormShape>({
        defaultValues: toFormValues(customer),
        resolver: zodResolver(customerSchema),
    })

    /** Shop accounts for the Add New Customer reference (create mode only). */
    const [shopAccounts, setShopAccounts] = useState<ShopAccount[]>([])
    const [shopAccountId, setShopAccountId] = useState('')

    useEffect(() => {
        if (isOpen) reset(toFormValues(customer))
    }, [isOpen, customer, reset])

    useEffect(() => {
        if (!isOpen || mode !== 'create') return
        let alive = true
        getShopAccounts()
            .then((accounts) => {
                if (alive) setShopAccounts(accounts)
            })
            .catch(() => undefined)
        return () => {
            alive = false
        }
    }, [isOpen, mode])

    const shopOptions: ShopAccountOption[] = shopAccounts.map((account) => ({
        value: account.id,
        label: shopOptionLabel(account),
    }))
    const selectedShop = shopAccounts.find((a) => a.id === shopAccountId) ?? null

    const pickShopAccount = (option: ShopAccountOption | null) => {
        setShopAccountId(option?.value ?? '')
        const account = shopAccounts.find((a) => a.id === option?.value)
        if (!account) return
        // Fetch the shop account details into the customer form.
        setValue('companyName', account.fullName, { shouldValidate: true })
        setValue('email', account.email, { shouldValidate: true })
        if (account.phone) setValue('phone', account.phone)
    }

    const onValid = (values: FormShape) =>
        onSubmit({
            ...values,
            phone: values.phone || undefined,
            // No credit limit is collected when adding a customer.
            creditLimit: mode === 'create' ? undefined : values.creditLimit,
            ...(mode === 'create' && shopAccountId
                ? { retailClientId: shopAccountId }
                : {}),
            ...(mode === 'create' && !shopAccountId && values.password
                ? { password: values.password }
                : {}),
        })

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title={mode === 'create' ? 'Add New Customer' : 'Edit Customer'}
            description={
                mode === 'create'
                    ? 'Register a new customer. Optionally reference the shop account created during sign-up.'
                    : customer
                      ? `${customer.customerNumber} · ${customer.companyName}`
                      : ''
            }
            icon={<HiOutlineOfficeBuilding />}
            footer={
                <div className="flex items-center gap-2">
                    <Button type="button" size="sm" disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        type="submit"
                        form={FORM_ID}
                        loading={saving}
                    >
                        {mode === 'create' ? 'Register customer' : 'Save changes'}
                    </Button>
                </div>
            }
        >
            <Form id={FORM_ID} onSubmit={handleSubmit(onValid)}>
                <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    <FormItem
                        label="Company name"
                        asterisk
                        invalid={Boolean(errors.companyName)}
                        errorMessage={errors.companyName?.message}
                    >
                        <Controller
                            name="companyName"
                            control={control}
                            render={({ field }) => (
                                <Input placeholder="e.g. Acme Trading Corp." {...field} />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Contact person"
                        asterisk
                        invalid={Boolean(errors.contactName)}
                        errorMessage={errors.contactName?.message}
                    >
                        <Controller
                            name="contactName"
                            control={control}
                            render={({ field }) => (
                                <Input placeholder="e.g. Juan Dela Cruz" {...field} />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Email"
                        asterisk
                        invalid={Boolean(errors.email)}
                        errorMessage={errors.email?.message}
                    >
                        <Controller
                            name="email"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="email"
                                    placeholder="purchasing@company.com"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Phone"
                        invalid={Boolean(errors.phone)}
                        errorMessage={errors.phone?.message}
                    >
                        <Controller
                            name="phone"
                            control={control}
                            render={({ field }) => (
                                <Input placeholder="+63 917 000 0000" {...field} />
                            )}
                        />
                    </FormItem>

                    {mode === 'create' && shopAccounts.length > 0 ? (
                        <FormItem
                            label="Shop account (reference)"
                            className="md:col-span-2"
                        >
                            <Select<ShopAccountOption>
                                isClearable
                                isSearchable
                                options={shopOptions}
                                value={shopOptions.find(
                                    (option) => option.value === shopAccountId,
                                )}
                                onChange={pickShopAccount}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Pick the account the customer created in the Shop — its
                                name, email and phone are fetched into this form and the
                                customer record is linked to it.
                            </p>
                            {selectedShop?.linkedCustomer && (
                                <p className="mt-1 text-xs text-amber-600">
                                    This shop account is already linked to{' '}
                                    {selectedShop.linkedCustomer.customerNumber} (
                                    {selectedShop.linkedCustomer.companyName}).
                                </p>
                            )}
                        </FormItem>
                    ) : null}

                    {mode === 'create' && !shopAccountId ? (
                        <FormItem
                            label="Shop login password"
                            className="md:col-span-2"
                            invalid={Boolean(errors.password)}
                            errorMessage={errors.password?.message}
                        >
                            <Controller
                                name="password"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="password"
                                        placeholder="Leave blank for an SD-only customer"
                                        {...field}
                                    />
                                )}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Setting a password creates the Shop account for this
                                customer (email is the login) and connects it to this
                                record — they can then sign in to the Shop.
                            </p>
                        </FormItem>
                    ) : null}

                    {mode === 'edit' ? (
                        <FormItem
                            label="Credit limit (PHP)"
                            invalid={Boolean(errors.creditLimit)}
                            errorMessage={errors.creditLimit?.message}
                        >
                            <Controller
                                name="creditLimit"
                                control={control}
                                render={({ field }) => (
                                    <NumericInput
                                        placeholder="0.00"
                                        thousandSeparator=","
                                        decimalScale={2}
                                        fixedDecimalScale
                                        allowNegative={false}
                                        value={field.value}
                                        onValueChange={(v) =>
                                            field.onChange(v.floatValue ?? 0)
                                        }
                                    />
                                )}
                            />
                            {customer ? (
                                <p className="mt-1 text-xs text-gray-500">
                                    Available now: {formatPrice(customer.availableCredit)}.
                                    Changing the limit shifts available credit by the same
                                    amount.
                                </p>
                            ) : null}
                        </FormItem>
                    ) : null}

                    <FormItem label="Status">
                        <Controller
                            name="status"
                            control={control}
                            render={({ field }) => (
                                <Select<StatusOption>
                                    isSearchable={false}
                                    options={STATUS_OPTIONS}
                                    value={STATUS_OPTIONS.find(
                                        (option) => option.value === field.value,
                                    )}
                                    onChange={(option) =>
                                        field.onChange(option?.value ?? 'ACTIVE')
                                    }
                                />
                            )}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Blocked customers stay on file but are marked on hold.
                        </p>
                    </FormItem>
                </div>
            </Form>
        </FormDialog>
    )
}

export default CustomerFormDialog