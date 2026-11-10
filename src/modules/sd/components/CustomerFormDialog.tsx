'use client'

import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HiOutlineOfficeBuilding } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import NumericInput from '@/components/shared/NumericInput'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Radio from '@/components/ui/Radio'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import {
    type CreateCustomerInput,
    type Customer,
    type CustomerAccountType,
    type CustomerCategory,
    type CreditStatus,
    type CustomerStatus,
    type PaymentTerm,
} from '../services/customerMasterService'

const MAX_CREDIT_LIMIT = 999_999_999_999.99

const customerSchema = z.object({
    customerAccountType: z.enum(['NON_CREDIT', 'CREDIT']),
    customerCategory: z.enum(['RETAIL', 'CORPORATE', 'EMPLOYEE', 'WHOLESALE']),
    paymentTerms: z.enum(['IMMEDIATE', 'NET_30']),
    creditStatus: z.enum(['NOT_APPLICABLE', 'PENDING', 'APPROVED', 'SUSPENDED']),
    companyName: z.string().trim().min(2, 'At least 2 characters').max(200),
    contactName: z.string().trim().min(2, 'At least 2 characters').max(120),
    email: z.string().trim().email('Enter a valid email').max(200),
    phone: z.string().trim().max(40),
    creditLimit: z
        .number({ message: 'Credit limit is required' })
        .min(0, 'Cannot be negative')
        .max(MAX_CREDIT_LIMIT, 'Credit limit is too large'),
    status: z.enum(['ACTIVE', 'BLOCKED', 'INACTIVE']),
})

const createCustomerSchema = customerSchema.superRefine((values, ctx) => {
    if (values.customerAccountType === 'CREDIT' && !values.creditLimit && values.creditLimit !== 0) {
        ctx.addIssue({
            code: 'custom',
            path: ['creditLimit'],
            message: 'CREDIT customers need a credit limit',
        })
    }
})

type FormShape = z.infer<typeof customerSchema>
type StatusOption = { value: CustomerStatus; label: string }
type AccountTypeOption = { value: CustomerAccountType; label: string }
type CategoryOption = { value: CustomerCategory; label: string }
type TermOption = { value: PaymentTerm; label: string }
type CreditStatusOption = { value: CreditStatus; label: string }

const STATUS_OPTIONS: StatusOption[] = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'BLOCKED', label: 'Blocked' },
    { value: 'INACTIVE', label: 'Inactive' },
]

const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
    { value: 'NON_CREDIT', label: 'Non-Credit Customer (Cash)' },
    { value: 'CREDIT', label: 'Credit Customer' },
]

const CATEGORY_OPTIONS: CategoryOption[] = [
    { value: 'RETAIL', label: 'Retail / Walk-in' },
    { value: 'CORPORATE', label: 'Corporate' },
    { value: 'EMPLOYEE', label: 'Employee' },
    { value: 'WHOLESALE', label: 'Wholesale' },
]

const TERM_OPTIONS: TermOption[] = [
    { value: 'IMMEDIATE', label: 'Immediate (pay now)' },
    { value: 'NET_30', label: 'Net 30' },
]

const CREDIT_STATUS_OPTIONS: CreditStatusOption[] = [
    { value: 'NOT_APPLICABLE', label: 'Not applicable' },
    { value: 'PENDING', label: 'Pending approval' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'SUSPENDED', label: 'Suspended' },
]

const FORM_ID = 'sd-customer-form'

const blankValues: FormShape = {
    customerAccountType: 'NON_CREDIT',
    customerCategory: 'RETAIL',
    paymentTerms: 'IMMEDIATE',
    creditStatus: 'NOT_APPLICABLE',
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    creditLimit: 0,
    status: 'ACTIVE',
}

const toFormValues = (customer?: Customer | null): FormShape =>
    customer
        ? {
              customerAccountType: customer.customerAccountType,
              customerCategory: customer.customerCategory,
              paymentTerms: customer.paymentTerms,
              creditStatus: customer.creditStatus,
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

    const {
        control,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<FormShape>({
        defaultValues: toFormValues(customer),
        resolver: zodResolver(isCreate ? createCustomerSchema : customerSchema),
    })

    const customerAccountType = useWatch({ control, name: 'customerAccountType' })
    const isCredit = customerAccountType === 'CREDIT'

    useEffect(() => {
        if (isOpen) reset(toFormValues(customer))
    }, [isOpen, customer, reset])

    const onValid = (values: FormShape) => {
        const shared = {
            companyName: values.companyName,
            contactName: values.contactName,
            email: values.email,
            phone: values.phone || undefined,
            status: values.status,
            customerAccountType: values.customerAccountType,
            customerCategory: values.customerCategory,
            paymentTerms: values.paymentTerms,
            creditStatus: values.creditStatus,
        }
        if (!isCreate) {
            return onSubmit(
                isCredit ? { ...shared, creditLimit: values.creditLimit } : shared,
            )
        }
        const payload: CreateCustomerInput = { ...shared }
        if (isCredit) {
            payload.creditLimit = values.creditLimit
        }
        return onSubmit(payload)
    }

    const description = isCreate
        ? isCredit
            ? 'Register a credit customer with a credit limit and payment terms.'
            : 'Register a cash customer. Payment is required immediately.'
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
                    <Button
                        type="button"
                        size="sm"
                        disabled={saving}
                        onClick={onClose}
                    >
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
                <FormItem
                    label="Customer account type"
                    asterisk
                >
                    <Controller
                        name="customerAccountType"
                        control={control}
                        render={({ field }) => (
                            <Radio.Group
                                value={field.value}
                                disabled={!isCreate}
                                onChange={(value: CustomerAccountType) =>
                                    field.onChange(value)
                                }
                            >
                                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                                    <Radio key={option.value} value={option.value}>
                                        {option.label}
                                    </Radio>
                                ))}
                            </Radio.Group>
                        )}
                    />
                    {!isCreate ? (
                        <p className="mt-1 text-xs text-gray-500">
                            Account type is fixed after registration.
                        </p>
                    ) : null}
                </FormItem>

                <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    <FormItem
                        label="Customer category"
                        asterisk
                        invalid={Boolean(errors.customerCategory)}
                        errorMessage={errors.customerCategory?.message}
                    >
                        <Controller
                            name="customerCategory"
                            control={control}
                            render={({ field }) => (
                                <Select<CategoryOption>
                                    isSearchable={false}
                                    options={CATEGORY_OPTIONS}
                                    value={CATEGORY_OPTIONS.find(
                                        (option) => option.value === field.value,
                                    )}
                                    onChange={(option) =>
                                        field.onChange(option?.value ?? 'RETAIL')
                                    }
                                />
                            )}
                        />
                    </FormItem>
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

                    {isCredit ? (
                        <>
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
                                            onValueChange={(v) =>
                                                field.onChange(v.floatValue ?? 0)
                                            }
                                        />
                                    )}
                                />
                                {!isCreate && customer ? (
                                    <p className="mt-1 text-xs text-gray-500">
                                        Available now:{' '}
                                        {formatPrice(customer.availableCredit)}.
                                        Changing the limit shifts available credit by
                                        the same amount.
                                    </p>
                                ) : null}
                            </FormItem>
                            <FormItem
                                label="Payment terms"
                                invalid={Boolean(errors.paymentTerms)}
                                errorMessage={errors.paymentTerms?.message}
                            >
                                <Controller
                                    name="paymentTerms"
                                    control={control}
                                    render={({ field }) => (
                                        <Select<TermOption>
                                            isSearchable={false}
                                            options={TERM_OPTIONS}
                                            value={TERM_OPTIONS.find(
                                                (option) => option.value === field.value,
                                            )}
                                            onChange={(option) =>
                                                field.onChange(option?.value ?? 'NET_30')
                                            }
                                        />
                                    )}
                                />
                            </FormItem>
                            <FormItem
                                label="Credit status"
                                invalid={Boolean(errors.creditStatus)}
                                errorMessage={errors.creditStatus?.message}
                            >
                                <Controller
                                    name="creditStatus"
                                    control={control}
                                    render={({ field }) => (
                                        <Select<CreditStatusOption>
                                            isSearchable={false}
                                            options={CREDIT_STATUS_OPTIONS}
                                            value={CREDIT_STATUS_OPTIONS.find(
                                                (option) =>
                                                    option.value === field.value,
                                            )}
                                            onChange={(option) =>
                                                field.onChange(option?.value ?? 'NOT_APPLICABLE')
                                            }
                                        />
                                    )}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Credit status controls whether the customer may buy on credit.
                                </p>
                            </FormItem>
                        </>
                    ) : null}
                </div>

                <FormItem
                    label="Status"
                    asterisk
                    className="md:max-w-[calc(50%-0.5rem)]"
                >
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
                        Blocked or inactive customers stay on file but cannot buy on credit.
                    </p>
                </FormItem>
            </Form>
        </FormDialog>
    )
}

export default CustomerFormDialog
