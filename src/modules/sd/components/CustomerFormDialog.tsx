'use client'

import { useEffect } from 'react'
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
} from '../services/customerMasterService'

const MAX_CREDIT_LIMIT = 999_999_999_999.99

const customerSchema = z.object({
    companyName: z.string().trim().min(2, 'At least 2 characters').max(200),
    contactName: z.string().trim().min(2, 'At least 2 characters').max(120),
    email: z.string().trim().email('Enter a valid email').max(200),
    phone: z.string().trim().max(40),
    creditLimit: z
        .number({ message: 'Credit limit is required' })
        .min(0, 'Cannot be negative')
        .max(MAX_CREDIT_LIMIT, 'Credit limit is too large'),
    status: z.enum(['ACTIVE', 'BLOCKED']),
})

type FormShape = z.infer<typeof customerSchema>
type StatusOption = { value: CustomerStatus; label: string }

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
    creditLimit: 0,
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
        formState: { errors },
    } = useForm<FormShape>({
        defaultValues: toFormValues(customer),
        resolver: zodResolver(customerSchema),
    })

    useEffect(() => {
        if (isOpen) reset(toFormValues(customer))
    }, [isOpen, customer, reset])

    const onValid = (values: FormShape) =>
        onSubmit({ ...values, phone: values.phone || undefined })

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title={mode === 'create' ? 'Add New Customer' : 'Edit Customer'}
            description={
                mode === 'create'
                    ? 'Register a new B2B client and assign a credit limit.'
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
                        {mode === 'edit' && customer ? (
                            <p className="mt-1 text-xs text-gray-500">
                                Available now: {formatPrice(customer.availableCredit)}.
                                Changing the limit shifts available credit by the same
                                amount.
                            </p>
                        ) : null}
                    </FormItem>
                    <FormItem label="Status" asterisk>
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
