'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Breadcrumb from '@/components/shared/Breadcrumb'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { useDocumentTypeMutations, useDocumentTypes } from '../hooks/useDocumentTypes'
import type { FicoDocumentType, FicoDocumentTypeInput } from '../types'

const blank = (): FicoDocumentTypeInput => ({ code: '', name: '', prefix: '', numberRangeFrom: 1, numberRangeTo: 999999, nextNumber: 1, allowsManualEntry: true, isActive: true })
const apiMessage = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Operation failed'

export default function DocumentTypesPage() {
    const list = useDocumentTypes(); const mutations = useDocumentTypeMutations(list.reload)
    const access = useResourceAccess('fico.configuration')
    const breadcrumbs = buildErpBreadcrumbs('/modules/fico/document-types-fi')
    const [open, setOpen] = useState(false); const [editing, setEditing] = useState<FicoDocumentType | null>(null)
    const [form, setForm] = useState<FicoDocumentTypeInput>(blank()); const [error, setError] = useState<string | null>(null)
    const show = (row?: FicoDocumentType) => { setEditing(row ?? null); setForm(row ? { code: row.code, name: row.name, prefix: row.prefix, numberRangeFrom: row.numberRangeFrom, numberRangeTo: row.numberRangeTo, nextNumber: row.nextNumber, allowsManualEntry: row.allowsManualEntry, isActive: row.isActive } : blank()); setError(null); setOpen(true) }
    const save = async () => { setError(null); try { editing ? await mutations.update(editing.id, form) : await mutations.create(form); setOpen(false) } catch (e) { setError(apiMessage(e)) } }
    const columns = useMemo<ColumnDef<FicoDocumentType>[]>(() => [
        { header: 'Code', accessorKey: 'code' }, { header: 'Name', accessorKey: 'name' },
        { header: 'Prefix', cell: ({ row }) => row.original.prefix || '—' },
        { header: 'Number Range', cell: ({ row }) => `${row.original.numberRangeFrom.toLocaleString()} – ${row.original.numberRangeTo.toLocaleString()}` },
        { header: 'Next Number', cell: ({ row }) => row.original.nextNumber.toLocaleString() },
        { header: 'Manual Entry', cell: ({ row }) => <StatusBadge tone={row.original.allowsManualEntry ? 'success' : 'default'}>{row.original.allowsManualEntry ? 'Allowed' : 'Blocked'}</StatusBadge> },
        { header: 'Status', cell: ({ row }) => <StatusBadge tone={row.original.isActive ? 'success' : 'default'}>{row.original.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
        { id: 'actions', header: '', cell: ({ row }) => <div className="flex justify-end gap-2">{access.canUpdate && <Button size="xs" onClick={() => show(row.original)}>Edit</Button>}{access.canDelete && row.original.isActive && <Button size="xs" variant="plain" className="text-red-600" onClick={() => confirm(`Deactivate ${row.original.code}?`) && void mutations.deactivate(row.original.id)}>Deactivate</Button>}</div> },
    ], [access.canDelete, access.canUpdate, mutations])
    return <PageContainer><ErpBackLink items={breadcrumbs}/><Breadcrumb items={breadcrumbs} className="mb-4"/><PageHeader title="FI Document Types" description="Control journal numbering and whether a document type permits manual entry." actions={access.canCreate ? <Button variant="solid" onClick={() => show()}>Add document type</Button> : undefined}/>{(list.error || error) && <Alert showIcon type="danger" className="mb-4">{list.error || error}</Alert>}<AdaptiveCard><DataTable columns={columns} data={list.data} loading={list.loading} noData={!list.loading && !list.data.length}/></AdaptiveCard><Dialog isOpen={open} onClose={() => setOpen(false)} onRequestClose={() => setOpen(false)}><h4 className="mb-4 text-lg font-semibold">{editing ? 'Edit document type' : 'Add document type'}</h4><div className="grid gap-4 sm:grid-cols-2"><Field label="Code"><Input value={form.code} onChange={(e) => setForm({...form, code:e.target.value})}/></Field><Field label="Name"><Input value={form.name} onChange={(e) => setForm({...form, name:e.target.value})}/></Field><Field label="Prefix"><Input value={form.prefix ?? ''} onChange={(e) => setForm({...form, prefix:e.target.value})}/></Field><NumberField label="Range from" value={form.numberRangeFrom} set={(value) => setForm({...form, numberRangeFrom:value})}/><NumberField label="Range to" value={form.numberRangeTo} set={(value) => setForm({...form, numberRangeTo:value})}/><NumberField label="Next number" value={form.nextNumber ?? form.numberRangeFrom} set={(value) => setForm({...form, nextNumber:value})}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowsManualEntry ?? true} onChange={(e) => setForm({...form, allowsManualEntry:e.target.checked})}/> Allows manual entry</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive ?? true} onChange={(e) => setForm({...form, isActive:e.target.checked})}/> Active</label></div><div className="mt-6 flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="solid" loading={mutations.saving} onClick={() => void save()}>Save</Button></div></Dialog></PageContainer>
}
function Field({label, children}:{label:string; children:React.ReactNode}) { return <label className="text-sm">{label}{children}</label> }
function NumberField({label,value,set}:{label:string;value:number;set:(v:number)=>void}) { return <Field label={label}><Input type="number" value={value} onChange={(e)=>set(Number(e.target.value))}/></Field> }
