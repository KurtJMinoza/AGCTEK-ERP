'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { type ColumnDef } from '@/components/shared/DataTable'
import SdDataTable from '../components/SdDataTable'
import {
    SdCompanyIdentityCell,
    SdContactCell,
    SdEmailCell,
    SdMoneyCell,
    SdStatusBadgeCell,
} from '../components/SdDataTableCells'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import CustomerFormDialog from '../components/CustomerFormDialog'
import type {
    CreateCustomerInput,
    Customer,
} from '../services/customerMasterService'
import { useCustomerStore, type CustomerFilters } from '../store/useCustomerStore'
import useResourceAccess from '@/utils/hooks/useResourceAccess'

const ROUTE_PATH = '/modules/sd/customer-master'
const SEARCH_DEBOUNCE_MS = 350

type StatusFilterOption = { value: CustomerFilters['status']; label: string }

const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
    { value: 'ALL', label: 'All statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'BLOCKED', label: 'Blocked' },
]

type AccountTypeFilterOption = {
    value: CustomerFilters['customerAccountType']
    label: string
}

const ACCOUNT_TYPE_FILTER_OPTIONS: AccountTypeFilterOption[] = [
    { value: 'ALL', label: 'All account types' },
    { value: 'NON_CREDIT', label: 'Cash (Non-Credit)' },
    { value: 'CREDIT', label: 'Credit' },
]

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

type DialogState =
    | { mode: 'create' }
    | { mode: 'edit'; customer: Customer }
    | null

const CustomerMasterDashboard = () => {
    const customers = useCustomerStore((s) => s.customers)
    const filters = useCustomerStore((s) => s.filters)
    const loading = useCustomerStore((s) => s.loading)
    const error = useCustomerStore((s) => s.error)
    const saving = useCustomerStore((s) => s.saving)
    const fetchCustomers = useCustomerStore((s) => s.fetchCustomers)
    const setFilters = useCustomerStore((s) => s.setFilters)
    const addCustomer = useCustomerStore((s) => s.addCustomer)
    const editCustomer = useCustomerStore((s) => s.editCustomer)
    const { canCreate, canUpdate } = useResourceAccess('sd.customer-master')

    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const [searchInput, setSearchInput] = useState(filters.search)
    const [dialog, setDialog] = useState<DialogState>(null)

    useEffect(() => {
        void fetchCustomers()
    }, [fetchCustomers])

    useEffect(() => {
        if (searchInput.trim() === filters.search.trim()) return
        const timer = window.setTimeout(
            () => void setFilters({ search: searchInput }),
            SEARCH_DEBOUNCE_MS,
        )
        return () => window.clearTimeout(timer)
    }, [searchInput, filters.search, setFilters])

    const handleSubmit = async (values: CreateCustomerInput) => {
        if (!dialog) return
        try {
            if (dialog.mode === 'create') {
                const created = await addCustomer(values)
                notify(
                    'success',
                    'Customer registered',
                    `${created.companyName} was added as ${created.customerNumber}.`,
                )
            } else {
                const updated = await editCustomer(dialog.customer.id, values)
                notify(
                    'success',
                    'Customer updated',
                    `${updated.companyName} saved. Available credit ${formatPrice(updated.availableCredit)}.`,
                )
            }
            setDialog(null)
        } catch (err) {
            notify(
                'danger',
                dialog.mode === 'create'
                    ? 'Customer not registered'
                    : 'Customer not updated',
                err instanceof Error ? err.message : 'Please try again.',
            )
        }
    }

    const columns = useMemo<ColumnDef<Customer>[]>(
        () => [
            {
                header: 'Customer',
                id: 'company',
                size: 150,
                minSize: 120,
                cell: ({ row }) => (
                    <SdCompanyIdentityCell
                        title={row.original.companyName}
                        subtitle={row.original.customerNumber}
                        narrowHint={row.original.contactName}
                    />
                ),
            },
            {
                header: 'Account type',
                id: 'customerAccountType',
                size: 115,
                meta: { className: 'hidden sm:table-cell' },
                cell: ({ row }) =>
                    row.original.customerAccountType === 'CREDIT' ? (
                        <SdStatusBadgeCell label="Credit" tone="warning" />
                    ) : (
                        <SdStatusBadgeCell
                            label={
                                row.original.paymentMode === 'BANK_TRANSFER'
                                    ? 'Bank Transfer'
                                    : row.original.paymentMode ===
                                      'LOAN_SALARY_DEDUCT'
                                      ? 'Loan (Salary Deduction)'
                                      : 'Cash'
                            }
                            tone="info"
                        />
                    ),
            },
            {
                header: 'Contact',
                id: 'contact',
                size: 150,
                minSize: 120,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => (
                    <SdContactCell
                        name={row.original.contactName}
                        email={row.original.email}
                        phone={row.original.phone}
                    />
                ),
            },
            {
                header: 'Customer category',
                id: 'customerCategory',
                size: 140,
                meta: { className: 'hidden sm:table-cell' },
                cell: ({ row }) => (
                    <SdStatusBadgeCell label={row.original.customerCategory} tone="info" />
                ),
            },
            {
                header: 'Credit Limit',
                id: 'creditLimit',
                size: 100,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) =>
                    row.original.customerAccountType === 'NON_CREDIT' ? (
                        <span className="text-gray-400">—</span>
                    ) : (
                        <SdMoneyCell amount={row.original.creditLimit} />
                    ),
            },
            {
                header: 'Available Credit',
                id: 'availableCredit',
                size: 100,
                meta: { className: 'hidden xl:table-cell' },
                cell: ({ row }) =>
                    row.original.customerAccountType === 'NON_CREDIT' ? (
                        <span className="text-gray-400">—</span>
                    ) : (
                        <SdMoneyCell
                            amount={row.original.availableCredit}
                            emphasize
                            negative={row.original.availableCredit < 0}
                        />
                    ),
            },
            {
                header: 'Shop Account',
                id: 'shopAccount',
                size: 130,
                meta: { className: 'hidden lg:table-cell' },
                cell: ({ row }) => (
                    <SdEmailCell email={row.original.retailClient?.email} />
                ),
            },
            {
                header: 'Status',
                id: 'status',
                size: 80,
                cell: ({ row }) =>
                    row.original.status === 'BLOCKED' ? (
                        <SdStatusBadgeCell label="Blocked" tone="danger" />
                    ) : (
                        <SdStatusBadgeCell label="Active" tone="success" />
                    ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) =>
                    canUpdate ? (
                        <Button
                            size="xs"
                            className="whitespace-nowrap"
                            icon={<HiOutlinePencil />}
                            onClick={() =>
                                setDialog({ mode: 'edit', customer: row.original })
                            }
                        >
                            Edit
                        </Button>
                    ) : null,
            },
        ],
        [canUpdate],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Customer Master"
                description="Retail shoppers and B2B clients, credit limits and account status for Sales & Distribution."
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={() => void fetchCustomers({ force: true })}
                        >
                            Refresh
                        </Button>
                        {canCreate && (
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlinePlus />}
                                onClick={() => setDialog({ mode: 'create' })}
                            >
                                Add New Customer
                            </Button>
                        )}
                    </div>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                    className="md:max-w-md"
                    prefix={<HiOutlineSearch className="text-lg" />}
                    placeholder="Search company, contact, email or customer no..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                />
                <div className="md:w-48">
                    <Select<StatusFilterOption>
                        isSearchable={false}
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find(
                            (option) => option.value === filters.status,
                        )}
                        onChange={(option) =>
                            void setFilters({ status: option?.value ?? 'ALL' })
                        }
                    />
                </div>
                <div className="md:w-48">
                    <Select<AccountTypeFilterOption>
                        isSearchable={false}
                        options={ACCOUNT_TYPE_FILTER_OPTIONS}
                        value={ACCOUNT_TYPE_FILTER_OPTIONS.find(
                            (option) =>
                                option.value === filters.customerAccountType,
                        )}
                        onChange={(option) =>
                            void setFilters({
                                customerAccountType:
                                    option?.value ?? 'ALL',
                            })
                        }
                    />
                </div>
            </div>

            <Card className="mt-4">
                <SdDataTable
                    columns={columns}
                    data={customers}
                    loading={loading && customers.length === 0}
                    noData={!loading && customers.length === 0}
                    hidePagination
                />
            </Card>

            <CustomerFormDialog
                isOpen={dialog !== null}
                mode={dialog?.mode ?? 'create'}
                customer={dialog?.mode === 'edit' ? dialog.customer : null}
                saving={saving}
                onClose={() => setDialog(null)}
                onSubmit={handleSubmit}
            />
        </PageContainer>
    )
}

export default CustomerMasterDashboard
