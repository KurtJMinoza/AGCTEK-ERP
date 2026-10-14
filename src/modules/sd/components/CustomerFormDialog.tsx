'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HiOutlineOfficeBuilding } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import NumericInput from '@/components/shared/NumericInput'
import PasswordInput from '@/components/shared/PasswordInput'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Radio from '@/components/ui/Radio'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import {
    getShopAccounts,
    type CreateCustomerInput,
    type Customer,
    type CustomerStatus,
    type CustomerType,
    type ShopAccount,
} from '../services/customerMasterService'

const MAX_CREDIT_LIMIT = 999_999_999_999.99
const NEW_SHOP_LOGIN = ''

const customerSchema = z.object({
    customerType: z.enum(['RETAIL', 'B2B']),
    companyName: z.string().trim().min(2, 'At least 2 characters').max(200),
    contactName: z.string().trim().min(2, 'At least 2 characters').max(120),
    email: z.string().trim().email('Enter a valid email').max(200),
    phone: z.string().trim().max(40),
    retailClientId: z.string(),
    password: z.string(),
    creditLimit: z
        .number({ message: 'Credit limit is required' })
        .min(0, 'Cannot be negative')
        .max(MAX_CREDIT_LIMIT, 'Credit limit is too large'),
    status: z.enum(['ACTIVE', 'BLOCKED']),
})

/** Matches the storefront password policy enforced by the backend. */
const isValidShopPassword = (password: string) =>
    password.length >= 8 &&
    password.length <= 72 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)

const createCustomerSchema = customerSchema.superRefine((values, ctx) => {
    if (
        values.customerType === 'RETAIL' &&
        values.retailClientId === NEW_SHOP_LOGIN &&
        !isValidShopPassword(values.password)
    ) {
        ctx.addIssue({
            code: 'custom',
            path: ['password'],
            message: '8–72 characters with at least one letter and one number',
        })
    }
})

type FormShape = z.infer<typeof customerSchema>
type StatusOption = { value: CustomerStatus; label: string }
type ShopAccountOption = { value: string; label: string }

const STATUS_OPTIONS: StatusOption[] = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'BLOCKED', label: 'Blocked' },
]

const NEW_SHOP_LOGIN_OPTION: ShopAccountOption = {
    value: NEW_SHOP_LOGIN,
    label: 'New shop login (uses the email above)',
}

const FORM_ID = 'sd-customer-form'

const blankValues: FormShape = {
    customerType: 'RETAIL',
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    retailClientId: NEW_SHOP_LOGIN,
    password: '',
    creditLimit: 0,
    status: 'ACTIVE',
}

const toFormValues = (customer?: Customer | null): FormShape =>
    customer
        ? {
              customerType: customer.customerType,
              companyName: customer.companyName,
              contactName: customer.contactName,
              email: customer.email,
              phone: customer.phone,
              retailClientId: customer.retailClientId ?? NEW_SHOP_LOGIN,
              password: '',
              creditLimit: customer.creditLimit,
              status: customer.status,
          }
        : blankValues

const toShopAccountOption = (account: ShopAccount): ShopAccountOption => ({
    value: account.id,
    label: `${account.fullName} · ${account.email}`,
})

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

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
    const isCreate = mode === 'create'
    const [loadedShopAccounts, setShopAccounts] = useState<ShopAccount[] | null>(null)
    const [shopAccountsError, setShopAccountsError] = useState<string | null>(null)
    const shopAccounts = loadedShopAccounts ?? []
    const shopAccountsLoading = loadedShopAccounts === null && !shopAccountsError

    const {
        control,
        handleSubmit,
        reset,
        getValues,
        setValue,
        formState: { errors },
    } = useForm<FormShape>({
        defaultValues: toFormValues(customer),
        resolver: zodResolver(isCreate ? createCustomerSchema : customerSchema),
    })

    const customerType = useWatch({ control, name: 'customerType' })
    const retailClientId = useWatch({ control, name: 'retailClientId' })
    const email = useWatch({ control, name: 'email' })
    const isRetail = customerType === 'RETAIL'
    const createsShopLogin = isCreate && retailClientId === NEW_SHOP_LOGIN

    useEffect(() => {
        if (isOpen) reset(toFormValues(customer))
    }, [isOpen, customer, reset])

    useEffect(() => {
        if (!isOpen || !isCreate) return
        let cancelled = false
        getShopAccounts()
            .then((accounts) => {
                if (!cancelled) {
                    setShopAccounts(accounts.filter((account) => !account.linkedCustomer))
                    setShopAccountsError(null)
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setShopAccountsError(
                        error instanceof Error ? error.message : 'Unable to load shop accounts',
                    )
                }
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, isCreate])

    const shopAccountOptions = [
        NEW_SHOP_LOGIN_OPTION,
        ...shopAccounts.map(toShopAccountOption),
    ]

    const onValid = (values: FormShape) => {
        const shared = {
            companyName: values.companyName,
            contactName: values.contactName,
            email: values.email,
            phone: values.phone || undefined,
            status: values.status,
        }
        const retail = values.customerType === 'RETAIL'

        if (!isCreate) {
            return onSubmit(retail ? shared : { ...shared, creditLimit: values.creditLimit })
        }
        if (!retail) {
            return onSubmit({ ...shared, customerType: 'B2B', creditLimit: values.creditLimit })
        }
        return onSubmit({
            ...shared,
            customerType: 'RETAIL',
            ...(values.retailClientId === NEW_SHOP_LOGIN
                ? { password: values.password }
                : { retailClientId: values.retailClientId }),
        })
    }

    const handleShopAccountChange = (option: ShopAccountOption | null) => {
        const id = option?.value ?? NEW_SHOP_LOGIN
        setValue('retailClientId', id)
        if (id === NEW_SHOP_LOGIN) return
        setValue('password', '')
        const account = shopAccounts.find((entry) => entry.id === id)
        if (!account) return
        if (!getValues('email').trim()) setValue('email', account.email)
        if (!getValues('contactName').trim()) setValue('contactName', account.fullName)
    }

    const description = isCreate
        ? isRetail
            ? 'Register an e-commerce shopper and link their shop login.'
            : 'Register a corporate client and assign a credit limit.'
        : customer
          ? `${customer.customerNumber} · ${customer.companyName}`
          : ''

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title={isCreate ? 'Add New Customer' : 'Edit Customer'}
            description={description}
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
                        {isCreate ? 'Register customer' : 'Save changes'}
                    </Button>
                </div>
            }
        >
            <Form id={FORM_ID} onSubmit={handleSubmit(onValid)}>
                <FormItem label="Customer type" asterisk>
                    <Controller
                        name="customerType"
                        control={control}
                        render={({ field }) => (
                            <Radio.Group
                                value={field.value}
                                disabled={!isCreate}
                                onChange={(value: CustomerType) => field.onChange(value)}
                            >
                                <Radio value="RETAIL">Retail (E-commerce)</Radio>
                                <Radio value="B2B">B2B (Corporate)</Radio>
                            </Radio.Group>
                        )}
                    />
                    {!isCreate ? (
                        <p className="mt-1 text-xs text-gray-500">
                            Customer type is fixed after registration.
                        </p>
                    ) : null}
                </FormItem>

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

                    {isRetail && isCreate ? (
                        <>
                            <FormItem
                                label="Shop account (reference)"
                                invalid={Boolean(shopAccountsError)}
                                errorMessage={shopAccountsError ?? undefined}
                            >
                                <Select<ShopAccountOption>
                                    isLoading={shopAccountsLoading}
                                    options={shopAccountOptions}
                                    value={shopAccountOptions.find(
                                        (option) => option.value === retailClientId,
                                    )}
                                    onChange={handleShopAccountChange}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Link an existing storefront login, or create a new one.
                                </p>
                            </FormItem>
                            <FormItem
                                label="Shop login password"
                                asterisk={createsShopLogin}
                                invalid={Boolean(errors.password)}
                                errorMessage={errors.password?.message}
                            >
                                <Controller
                                    name="password"
                                    control={control}
                                    render={({ field }) => (
                                        <PasswordInput
                                            autoComplete="new-password"
                                            placeholder={
                                                createsShopLogin
                                                    ? 'At least 8 characters'
                                                    : 'Not needed for an existing account'
                                            }
                                            disabled={!createsShopLogin}
                                            {...field}
                                        />
                                    )}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    {createsShopLogin
                                        ? `The customer signs in to the shop as ${email.trim() || 'the email above'}.`
                                        : 'The customer keeps the linked account’s password.'}
                                </p>
                            </FormItem>
                        </>
                    ) : null}

                    {isRetail && !isCreate ? (
                        <FormItem label="Shop account (reference)">
                            <Input
                                disabled
                                value={
                                    customer?.retailClientId
                                        ? 'Linked to a storefront login'
                                        : 'No storefront login linked'
                                }
                            />
                        </FormItem>
                    ) : null}

                    {!isRetail ? (
                        <FormItem
                            label="Credit limit (PHP)"
                            asterisk
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
                                        onValueChange={(v) => field.onChange(v.floatValue ?? 0)}
                                    />
                                )}
                            />
                            {!isCreate && customer ? (
                                <p className="mt-1 text-xs text-gray-500">
                                    Available now: {formatPrice(customer.availableCredit)}.
                                    Changing the limit shifts available credit by the same
                                    amount.
                                </p>
                            ) : null}
                        </FormItem>
                    ) : null}
                </div>

                <FormItem label="Status" asterisk className="md:max-w-[calc(50%-0.5rem)]">
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
            </Form>
        </FormDialog>
    )
}

export default CustomerFormDialog
