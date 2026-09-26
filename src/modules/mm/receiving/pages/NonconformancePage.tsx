'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import { FormItem, FormContainer } from '@/components/ui/Form'
import Tag from '@/components/ui/Tag'
import {
    qualityService,
    type MmNonconformance,
    type MmCorrectiveAction,
    type CreateCapaPayload,
    type TransitionCapaPayload,
} from '../services/qualityService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/nonconformances'

const CAPA_TRANSITIONS: Record<string, { label: string; targets: string[] }> = {
    OPEN: { label: 'Start', targets: ['IN_PROGRESS'] },
    IN_PROGRESS: { label: 'Complete', targets: ['COMPLETED'] },
    COMPLETED: { label: 'Verify', targets: ['VERIFIED'] },
    VERIFIED: { label: 'Close', targets: ['CLOSED'] },
}

export default function NonconformancePage() {
    const [rows, setRows] = useState<MmNonconformance[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedNcId, setExpandedNcId] = useState<string | null>(null)
    const [capaList, setCapaList] = useState<MmCorrectiveAction[]>([])
    const [capaLoading, setCapaLoading] = useState(false)

    // CAPA dialog state
    const [capaDialogOpen, setCapaDialogOpen] = useState(false)
    const [capaDialogNcId, setCapaDialogNcId] = useState<string | null>(null)
    const [capaForm, setCapaForm] = useState<CreateCapaPayload>({})

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await qualityService.listNc({ pageSize: 50 })
            setRows(res.data ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const loadCapa = useCallback(async (ncId: string) => {
        setCapaLoading(true)
        try {
            const data = await qualityService.listCapaForNc(ncId)
            setCapaList(data)
        } finally {
            setCapaLoading(false)
        }
    }, [])

    const toggleExpand = useCallback(
        (ncId: string) => {
            if (expandedNcId === ncId) {
                setExpandedNcId(null)
                setCapaList([])
            } else {
                setExpandedNcId(ncId)
                void loadCapa(ncId)
            }
        },
        [expandedNcId, loadCapa],
    )

    const openCreateCapa = useCallback((ncId: string) => {
        setCapaDialogNcId(ncId)
        setCapaForm({})
        setCapaDialogOpen(true)
    }, [])

    const handleCreateCapa = useCallback(async () => {
        if (!capaDialogNcId) return
        await qualityService.createCapa(capaDialogNcId, capaForm)
        setCapaDialogOpen(false)
        void loadCapa(capaDialogNcId)
        void load()
    }, [capaDialogNcId, capaForm, loadCapa, load])

    const handleTransition = useCallback(
        async (capaId: string, targetStatus: string) => {
            await qualityService.transitionCapa(capaId, {
                targetStatus,
            } satisfies TransitionCapaPayload)
            if (expandedNcId) void loadCapa(expandedNcId)
        },
        [expandedNcId, loadCapa],
    )

    const columns: ColumnDef<MmNonconformance>[] = useMemo(
        () => [
            { header: 'NC #', accessorKey: 'ncNumber' },
            {
                header: 'Lot',
                accessorKey: 'inspectionLot.lotNumber',
                cell: ({ row }) => row.original.inspectionLot?.lotNumber ?? '—',
            },
            { header: 'Cause', accessorKey: 'cause' },
            { header: 'Severity', accessorKey: 'severity' },
            {
                header: 'Qty',
                accessorKey: 'affectedQuantity',
                cell: ({ row }) => Number(row.original.affectedQuantity),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'CAPA',
                id: 'capaCount',
                cell: ({ row }) => {
                    const count = row.original.correctiveActions?.length ?? 0
                    return (
                        <Button size="xs" variant="plain" onClick={() => toggleExpand(row.original.id)}>
                            {count} CAPA {expandedNcId === row.original.id ? '▲' : '▼'}
                        </Button>
                    )
                },
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex gap-2">
                        {row.original.status !== 'RESOLVED' && row.original.status !== 'CLOSED' && (
                            <>
                                <Button
                                    size="xs"
                                    onClick={async () => {
                                        await qualityService.resolveNc(row.original.id, {
                                            resolvedBy: 'user',
                                        })
                                        load()
                                    }}
                                >
                                    Resolve
                                </Button>
                                <Button
                                    size="xs"
                                    variant="solid"
                                    onClick={() => openCreateCapa(row.original.id)}
                                >
                                    + CAPA
                                </Button>
                            </>
                        )}
                    </div>
                ),
            },
        ],
        [load, toggleExpand, expandedNcId, openCreateCapa],
    )

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Nonconformances"
                description="Quality incidents from failed inspections and defects."
            />
            <DataTable columns={columns} data={rows} loading={loading} />

            {/* Expanded CAPA panel */}
            {expandedNcId && (
                <div className="mt-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-3">
                        <h6 className="font-semibold text-sm">
                            Corrective Actions for{' '}
                            {rows.find((r) => r.id === expandedNcId)?.ncNumber ?? expandedNcId}
                        </h6>
                        <Button
                            size="xs"
                            variant="solid"
                            onClick={() => openCreateCapa(expandedNcId)}
                        >
                            + New CAPA
                        </Button>
                    </div>
                    {capaLoading ? (
                        <div className="text-sm text-gray-400">Loading...</div>
                    ) : capaList.length === 0 ? (
                        <div className="text-sm text-gray-400">No corrective actions yet.</div>
                    ) : (
                        <div className="space-y-3">
                            {capaList.map((ca) => (
                                <div
                                    key={ca.id}
                                    className="p-3 bg-white dark:bg-gray-900 rounded border"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">
                                                {ca.actionNumber}
                                            </span>
                                            <CapaStatusTag
                                                status={ca.status}
                                                effectiveStatus={ca.effectiveStatus}
                                            />
                                        </div>
                                        <div className="flex gap-1">
                                            {CAPA_TRANSITIONS[ca.status]?.targets.map(
                                                (target) => (
                                                    <Button
                                                        key={target}
                                                        size="xs"
                                                        onClick={() =>
                                                            handleTransition(ca.id, target)
                                                        }
                                                    >
                                                        {target === 'IN_PROGRESS'
                                                            ? 'Start'
                                                            : target === 'COMPLETED'
                                                              ? 'Complete'
                                                              : target === 'VERIFIED'
                                                                ? 'Verify'
                                                                : 'Close'}
                                                    </Button>
                                                ),
                                            )}
                                            {ca.status !== 'CLOSED' &&
                                                ca.status !== 'VERIFIED' && (
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        onClick={() =>
                                                            handleTransition(ca.id, 'CLOSED')
                                                        }
                                                    >
                                                        Close
                                                    </Button>
                                                )}
                                        </div>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2 text-xs text-gray-600 dark:text-gray-300">
                                        {ca.problem && (
                                            <div>
                                                <strong>Problem:</strong> {ca.problem}
                                            </div>
                                        )}
                                        {ca.rootCause && (
                                            <div>
                                                <strong>Root Cause:</strong> {ca.rootCause}
                                            </div>
                                        )}
                                        {ca.containment && (
                                            <div>
                                                <strong>Containment:</strong> {ca.containment}
                                            </div>
                                        )}
                                        {ca.correctiveAction && (
                                            <div>
                                                <strong>Corrective Action:</strong>{' '}
                                                {ca.correctiveAction}
                                            </div>
                                        )}
                                        {ca.preventiveAction && (
                                            <div>
                                                <strong>Preventive Action:</strong>{' '}
                                                {ca.preventiveAction}
                                            </div>
                                        )}
                                        {ca.owner && (
                                            <div>
                                                <strong>Owner:</strong> {ca.owner}
                                            </div>
                                        )}
                                        {ca.dueDate && (
                                            <div>
                                                <strong>Due:</strong>{' '}
                                                {new Date(ca.dueDate).toLocaleDateString()}
                                            </div>
                                        )}
                                        {ca.resolution && (
                                            <div>
                                                <strong>Resolution:</strong> {ca.resolution}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create CAPA Dialog */}
            <Dialog
                isOpen={capaDialogOpen}
                onClose={() => setCapaDialogOpen(false)}
                onRequestClose={() => setCapaDialogOpen(false)}
            >
                <h5 className="mb-4 font-semibold">Create Corrective Action</h5>
                <FormContainer>
                    <FormItem label="Problem">
                        <Input
                            textArea
                            value={capaForm.problem ?? ''}
                            onChange={(e) =>
                                setCapaForm((f) => ({ ...f, problem: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Root Cause">
                        <Input
                            textArea
                            value={capaForm.rootCause ?? ''}
                            onChange={(e) =>
                                setCapaForm((f) => ({ ...f, rootCause: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Containment">
                        <Input
                            textArea
                            value={capaForm.containment ?? ''}
                            onChange={(e) =>
                                setCapaForm((f) => ({ ...f, containment: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Corrective Action">
                        <Input
                            textArea
                            value={capaForm.correctiveAction ?? ''}
                            onChange={(e) =>
                                setCapaForm((f) => ({
                                    ...f,
                                    correctiveAction: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Preventive Action">
                        <Input
                            textArea
                            value={capaForm.preventiveAction ?? ''}
                            onChange={(e) =>
                                setCapaForm((f) => ({
                                    ...f,
                                    preventiveAction: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormItem label="Owner">
                            <Input
                                value={capaForm.owner ?? ''}
                                onChange={(e) =>
                                    setCapaForm((f) => ({ ...f, owner: e.target.value }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Due Date">
                            <Input
                                type="date"
                                value={capaForm.dueDate ?? ''}
                                onChange={(e) =>
                                    setCapaForm((f) => ({ ...f, dueDate: e.target.value }))
                                }
                            />
                        </FormItem>
                    </div>
                    <FormItem label="Notes">
                        <Input
                            textArea
                            value={capaForm.notes ?? ''}
                            onChange={(e) =>
                                setCapaForm((f) => ({ ...f, notes: e.target.value }))
                            }
                        />
                    </FormItem>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button onClick={() => setCapaDialogOpen(false)}>Cancel</Button>
                        <Button variant="solid" onClick={handleCreateCapa}>
                            Create
                        </Button>
                    </div>
                </FormContainer>
            </Dialog>
        </PageContainer>
    )
}

function CapaStatusTag({
    status,
    effectiveStatus,
}: {
    status: string
    effectiveStatus: string
}) {
    if (effectiveStatus === 'OVERDUE') {
        return <Tag className="bg-red-500 text-white">OVERDUE</Tag>
    }
    const colorMap: Record<string, string> = {
        OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        IN_PROGRESS: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
        COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        VERIFIED: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
        CLOSED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    }
    return <Tag className={colorMap[status] ?? ''}>{status}</Tag>
}
