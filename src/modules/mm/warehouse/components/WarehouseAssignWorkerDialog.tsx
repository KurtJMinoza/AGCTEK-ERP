'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Avatar from '@/components/ui/Avatar'
import { HiOutlineCheckCircle, HiOutlineSearch, HiOutlineUserAdd } from 'react-icons/hi'
import { pickingService } from '../services/pickingService'
import type { AssignableWorker } from '../types'

function workerInitials(worker: AssignableWorker) {
    const initials = worker.displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((name) => name[0])
        .join('')
        .toUpperCase()
    return initials || 'W'
}

export type WarehouseAssignWorkerDialogProps = {
    isOpen: boolean
    onClose: () => void
    taskNumber?: string | null
    companyId?: string | null
    warehouseId?: string | null
    initialUserId?: string | null
    confirmLoading?: boolean
    onConfirm: (userId: string) => void | Promise<void>
}

export default function WarehouseAssignWorkerDialog({
    isOpen,
    onClose,
    taskNumber,
    companyId,
    warehouseId,
    initialUserId,
    confirmLoading,
    onConfirm,
}: WarehouseAssignWorkerDialogProps) {
    const [assignUserId, setAssignUserId] = useState('')
    const [assignWorkerSearch, setAssignWorkerSearch] = useState('')
    const [assignWorkers, setAssignWorkers] = useState<AssignableWorker[]>([])
    const [assignWorkersLoading, setAssignWorkersLoading] = useState(false)

    const loadWorkers = useCallback(async () => {
        setAssignWorkersLoading(true)
        try {
            setAssignWorkers(
                await pickingService.assignableUsers(
                    companyId ?? undefined,
                    warehouseId ?? undefined,
                ),
            )
        } catch {
            setAssignWorkers([])
        } finally {
            setAssignWorkersLoading(false)
        }
    }, [companyId, warehouseId])

    useEffect(() => {
        if (!isOpen) return
        setAssignUserId(initialUserId?.trim() ?? '')
        setAssignWorkerSearch('')
        void loadWorkers()
    }, [isOpen, initialUserId, loadWorkers])

    const filteredAssignWorkers = useMemo(() => {
        const query = assignWorkerSearch.trim().toLocaleLowerCase()
        if (!query) return assignWorkers
        return assignWorkers.filter((worker) =>
            [
                worker.displayName,
                worker.email,
                worker.employeeId,
                worker.jobPosition,
                worker.role,
            ].some((value) => value?.toLocaleLowerCase().includes(query)),
        )
    }, [assignWorkerSearch, assignWorkers])

    const selectedAssignWorker = useMemo(
        () => assignWorkers.find((worker) => worker.id === assignUserId) ?? null,
        [assignUserId, assignWorkers],
    )

    const handleConfirm = () => {
        if (!assignUserId.trim()) return
        void onConfirm(assignUserId.trim())
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title="Assign task"
            description={
                taskNumber
                    ? `Assign ${taskNumber} to an active employee for this company.`
                    : 'Choose an active employee for this warehouse task.'
            }
            icon={<HiOutlineUserAdd />}
            headerExtra={
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    Search by name, email, role, position, or employee ID.
                </span>
            }
            footer={
                <>
                    <Button size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        loading={confirmLoading}
                        disabled={!assignUserId.trim() || assignWorkersLoading}
                        onClick={handleConfirm}
                    >
                        Assign worker
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <label
                        htmlFor="wm-assign-worker-search"
                        className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-100"
                    >
                        Search employee
                    </label>
                    <Input
                        id="wm-assign-worker-search"
                        size="lg"
                        autoFocus
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search by name, email, role or position…"
                        value={assignWorkerSearch}
                        onChange={(event) =>
                            setAssignWorkerSearch(event.target.value)
                        }
                    />
                </div>

                {selectedAssignWorker ? (
                    <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary-subtle/60 px-3 py-3 dark:border-primary/30 dark:bg-primary/10">
                        <Avatar
                            size={44}
                            src={selectedAssignWorker.avatar || undefined}
                            alt={selectedAssignWorker.displayName}
                            className="shrink-0 bg-primary text-white"
                        >
                            {workerInitials(selectedAssignWorker)}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {selectedAssignWorker.displayName}
                            </p>
                            <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                                {selectedAssignWorker.jobPosition ||
                                    selectedAssignWorker.role}
                                {' · '}
                                {selectedAssignWorker.email}
                            </p>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-medium text-primary-deep dark:text-primary-light">
                            <HiOutlineCheckCircle className="text-base" />
                            Selected
                        </span>
                    </div>
                ) : null}

                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            Available employees
                        </span>
                        <span
                            className="text-xs text-gray-500 dark:text-gray-400"
                            aria-live="polite"
                        >
                            {assignWorkersLoading
                                ? 'Loading…'
                                : `${filteredAssignWorkers.length} available`}
                        </span>
                    </div>
                    <div className="max-h-[min(23rem,50vh)] space-y-2 overflow-y-auto p-2.5">
                        {assignWorkersLoading ? (
                            Array.from({ length: 4 }, (_, index) => (
                                <div
                                    key={index}
                                    className="flex animate-pulse items-center gap-3 rounded-lg px-2 py-2"
                                >
                                    <div className="h-11 w-11 rounded-full bg-gray-200 dark:bg-gray-700" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-36 rounded bg-gray-200 dark:bg-gray-700" />
                                        <div className="h-2.5 w-56 max-w-full rounded bg-gray-100 dark:bg-gray-800" />
                                    </div>
                                </div>
                            ))
                        ) : filteredAssignWorkers.length ? (
                            filteredAssignWorkers.map((worker) => {
                                const isSelected = worker.id === assignUserId
                                return (
                                    <button
                                        key={worker.id}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => setAssignUserId(worker.id)}
                                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                            isSelected
                                                ? 'border-primary bg-primary-subtle/70 dark:bg-primary/10'
                                                : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-600 dark:hover:bg-gray-800/70'
                                        }`}
                                    >
                                        <Avatar
                                            size={46}
                                            src={worker.avatar || undefined}
                                            alt={worker.displayName}
                                            className="shrink-0 bg-gray-200 font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-100"
                                        >
                                            {workerInitials(worker)}
                                        </Avatar>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {worker.displayName}
                                            </span>
                                            <span className="mt-0.5 block truncate text-xs text-gray-600 dark:text-gray-300">
                                                {worker.email}
                                            </span>
                                            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                                                {worker.jobPosition || worker.role}
                                                {worker.employeeId
                                                    ? ` · Employee ID ${worker.employeeId}`
                                                    : ''}
                                            </span>
                                        </span>
                                        {isSelected ? (
                                            <HiOutlineCheckCircle className="shrink-0 text-xl text-primary" />
                                        ) : null}
                                    </button>
                                )
                            })
                        ) : (
                            <div className="px-3 py-10 text-center">
                                <HiOutlineSearch className="mx-auto mb-2 text-2xl text-gray-300 dark:text-gray-600" />
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    {assignWorkers.length
                                        ? 'No employees match your search'
                                        : 'No assignable employees'}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {assignWorkers.length
                                        ? 'Try another name, email, role, or position.'
                                        : 'Only active members of the task company appear here.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </FormDialog>
    )
}
