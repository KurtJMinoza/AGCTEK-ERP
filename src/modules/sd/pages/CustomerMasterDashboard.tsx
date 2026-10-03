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
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
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

const ROUTE_PATH = '/modules/sd/customer-master'
const SEARCH_DEBOUNCE_MS = 350

type StatusFilterOption = { value: CustomerFilters['status']; label: string }

const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
    { value: 'ALL', label: 'All statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'BLOCKED', label: 'Blocked' },
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

const SummaryStat = ({ label, value }: { label: string; value: string | number }) => (
    <Card>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 break-words text-xl font-bold sm:text-2xl">
            {value}
        </div>
    </Card>
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

    const summary = useMemo(
        () => ({
            total: customers.length,
            blocked: customers.filter((c) => c.status === 'BLOCKED').length,
            creditLimit: customers.reduce((sum, c) => sum + c.creditLimit, 0),
            availableCredit: customers.reduce(
                (sum, c) => sum + c.availableCredit,
                0,
            ),
        }),
        [customers],
    )

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
                cell: ({ row }) => (
                    <div className="min-w-[10rem]">
                        <div className="font-semibold">{row.original.companyName}</div>
                        <div className="font-mono text-xs text-gray-500">
                            {row.original.customerNumber}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Contact',
                id: 'contact',
                cell: ({ row }) => (
                    <div className="min-w-[12rem]">
                        <div>{row.original.contactName}</div>
                        <div className="text-xs text-gray-500">
                            {row.original.email}
                            {row.original.phone ? ` · ${row.original.phone}` : ''}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Credit Limit',
                id: 'creditLimit',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {formatPrice(row.original.creditLimit)}
                    </span>
                ),
            },
            {
                header: 'Available Credit',
                id: 'availableCredit',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.availableCredit < 0
                                ? 'whitespace-nowrap font-semibold text-red-600'
                                : 'whitespace-nowrap font-semibold'
                        }
                    >
                        {formatPrice(row.original.availableCredit)}
                    </span>
                ),
            },
            {
                header: 'Status',
                id: 'status',
                cell: ({ row }) =>
                    row.original.status === 'BLOCKED' ? (
                        <StatusBadge tone="danger">Blocked</StatusBadge>
                    ) : (
                        <StatusBadge tone="success">Active</StatusBadge>
                    ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
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
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Customer Master"
                description="B2B clients, credit limits and account status for Sales & Distribution."
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
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlinePlus />}
                            onClick={() => setDialog({ mode: 'create' })}
                        >
                            Add New Customer
                        </Button>
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
            </div>

            <div className="my-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <SummaryStat label="Customers" value={summary.total} />
                <SummaryStat label="Blocked" value={summary.blocked} />
                <SummaryStat
                    label="Total Credit Limit"
                    value={formatPrice(summary.creditLimit)}
                />
                <SummaryStat
                    label="Total Available Credit"
                    value={formatPrice(summary.availableCredit)}
                />
            </div>

            <Card>
                <DataTable
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
