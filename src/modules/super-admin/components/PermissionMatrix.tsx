'use client'

import { useState } from 'react'
import { PiCaretDownBold, PiCaretRightBold } from 'react-icons/pi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Checkbox from '@/components/ui/Checkbox'
import Tag from '@/components/ui/Tag'
import type {
    CrudFlags,
    RolePermissionGroup,
    RoleResourceRow,
} from '@/services/PermissionService'

const ACTION_COLUMNS: { field: keyof CrudFlags; label: string }[] = [
    { field: 'canRead', label: 'Read' },
    { field: 'canCreate', label: 'Create' },
    { field: 'canUpdate', label: 'Update' },
    { field: 'canDelete', label: 'Delete' },
]

const WRITE_FIELDS: (keyof CrudFlags)[] = [
    'canCreate',
    'canUpdate',
    'canDelete',
]

/** Mirrors the backend rule: any write implies Read; removing Read removes the writes. */
function applyToggle(
    row: RoleResourceRow,
    field: keyof CrudFlags,
    value: boolean,
): RoleResourceRow {
    const next = { ...row, [field]: value }
    if (value && WRITE_FIELDS.includes(field)) next.canRead = true
    if (!value && field === 'canRead') {
        next.canCreate = false
        next.canUpdate = false
        next.canDelete = false
    }
    return next
}

function hasChildren(row: RoleResourceRow) {
    return Boolean(row.children?.length)
}

/** Rows that hold grants: features, plus submodules without features. */
function grantRows(resources: RoleResourceRow[]) {
    return resources.flatMap((r) => (hasChildren(r) ? r.children! : [r]))
}

function flatRows(groups: RolePermissionGroup[]) {
    return groups.flatMap((g) => grantRows(g.resources))
}

export function sameFlags(a: RolePermissionGroup[], b: RolePermissionGroup[]) {
    const left = flatRows(a)
    const right = flatRows(b)
    return left.every((row, i) =>
        ACTION_COLUMNS.every(({ field }) => row[field] === right[i]?.[field]),
    )
}

/** Request body rows for the role and template permission endpoints (grant rows only). */
export function toPermissionEntries(groups: RolePermissionGroup[]) {
    return flatRows(groups).map(
        ({ code, canRead, canCreate, canUpdate, canDelete }) => ({
            resourceCode: code,
            canRead,
            canCreate,
            canUpdate,
            canDelete,
        }),
    )
}

function columnState(rows: RoleResourceRow[], field: keyof CrudFlags) {
    const checked = rows.filter((r) => r[field]).length
    return {
        checked: checked > 0 && checked === rows.length,
        indeterminate: checked > 0 && checked < rows.length,
    }
}

type ActionCellsProps = {
    rows: RoleResourceRow[]
    label: string
    disabled: boolean
    onToggle: (field: keyof CrudFlags, value: boolean) => void
    header?: boolean
}

/** Read/Create/Update/Delete checkboxes for one row, or tri-state for a set of rows. */
const ActionCells = ({
    rows,
    label,
    disabled,
    onToggle,
    header,
}: ActionCellsProps) => (
    <>
        {ACTION_COLUMNS.map(({ field, label: action }) => {
            const state = columnState(rows, field)
            const checkbox = (
                <Checkbox
                    className="justify-center"
                    checked={state.checked}
                    indeterminate={state.indeterminate}
                    disabled={disabled}
                    aria-label={`${label} ${action}${rows.length > 1 ? ' (all)' : ''}`}
                    onChange={() => onToggle(field, !state.checked)}
                />
            )
            return header ? (
                <th key={field} className="w-24 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold heading-text">
                            {action}
                        </span>
                        {checkbox}
                    </div>
                </th>
            ) : (
                <td key={field} className="py-2.5 text-center">
                    {checkbox}
                </td>
            )
        })}
    </>
)

const InactiveTag = () => (
    <Tag className="border-0 bg-gray-100 text-xs text-gray-500 dark:bg-gray-700">
        Inactive
    </Tag>
)

type PermissionMatrixProps = {
    groups: RolePermissionGroup[]
    disabled: boolean
    onChange: (groups: RolePermissionGroup[]) => void
}

const PermissionMatrix = ({
    groups,
    disabled,
    onChange,
}: PermissionMatrixProps) => {
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
        new Set(),
    )
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    /** Applies `update` to the grant rows of a group that `match` selects. */
    const updateRows = (
        groupCode: string,
        match: (row: RoleResourceRow, parent?: RoleResourceRow) => boolean,
        update: (row: RoleResourceRow) => RoleResourceRow,
    ) =>
        onChange(
            groups.map((g) =>
                g.code !== groupCode
                    ? g
                    : {
                          ...g,
                          resources: g.resources.map((r) =>
                              hasChildren(r)
                                  ? {
                                        ...r,
                                        children: r.children!.map((c) =>
                                            match(c, r) ? update(c) : c,
                                        ),
                                    }
                                  : match(r)
                                    ? update(r)
                                    : r,
                          ),
                      },
            ),
        )

    const toggle = (set: Set<string>, code: string) => {
        const next = new Set(set)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        return next
    }

    const renderLeaf = (
        groupCode: string,
        row: RoleResourceRow,
        indentClass: string,
    ) => (
        <tr key={row.code}>
            <td className={`py-2.5 pr-4 ${indentClass}`}>
                <div className="flex items-center gap-2">
                    <span className="font-medium heading-text">{row.name}</span>
                    {!row.isActive && <InactiveTag />}
                </div>
                {row.description && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {row.description}
                    </p>
                )}
            </td>
            <ActionCells
                rows={[row]}
                label={row.name}
                disabled={disabled}
                onToggle={(field, value) =>
                    updateRows(
                        groupCode,
                        (r) => r.code === row.code,
                        (r) => applyToggle(r, field, value),
                    )
                }
            />
        </tr>
    )

    return (
        <>
            {groups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.code)
                const groupRows = grantRows(group.resources)
                return (
                    <AdaptiveCard key={group.code} bodyClass="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="px-4 py-3 text-left">
                                            <button
                                                type="button"
                                                className="flex items-center gap-2 font-semibold heading-text"
                                                onClick={() =>
                                                    setCollapsedGroups((prev) =>
                                                        toggle(prev, group.code),
                                                    )
                                                }
                                            >
                                                {isCollapsed ? (
                                                    <PiCaretRightBold />
                                                ) : (
                                                    <PiCaretDownBold />
                                                )}
                                                {group.name}
                                                <Tag className="border-0 bg-gray-100 text-xs dark:bg-gray-700">
                                                    {group.resources.length}
                                                </Tag>
                                                {!group.isActive && (
                                                    <InactiveTag />
                                                )}
                                            </button>
                                        </th>
                                        <ActionCells
                                            header
                                            rows={groupRows}
                                            label={group.name}
                                            disabled={disabled}
                                            onToggle={(field, value) =>
                                                updateRows(
                                                    group.code,
                                                    () => true,
                                                    (r) =>
                                                        applyToggle(
                                                            r,
                                                            field,
                                                            value,
                                                        ),
                                                )
                                            }
                                        />
                                    </tr>
                                </thead>
                                {!isCollapsed && (
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {group.resources.flatMap((row) => {
                                            if (!hasChildren(row)) {
                                                return [
                                                    renderLeaf(
                                                        group.code,
                                                        row,
                                                        'pl-10',
                                                    ),
                                                ]
                                            }
                                            const isOpen = expanded.has(
                                                row.code,
                                            )
                                            const header = (
                                                <tr
                                                    key={row.code}
                                                    className="bg-gray-50 dark:bg-gray-800/40"
                                                >
                                                    <td className="py-2.5 pl-10 pr-4">
                                                        <button
                                                            type="button"
                                                            className="flex items-center gap-2 text-left"
                                                            aria-expanded={
                                                                isOpen
                                                            }
                                                            onClick={() =>
                                                                setExpanded(
                                                                    (prev) =>
                                                                        toggle(
                                                                            prev,
                                                                            row.code,
                                                                        ),
                                                                )
                                                            }
                                                        >
                                                            {isOpen ? (
                                                                <PiCaretDownBold />
                                                            ) : (
                                                                <PiCaretRightBold />
                                                            )}
                                                            <span className="font-semibold heading-text">
                                                                {row.name}
                                                            </span>
                                                            <Tag className="border-0 bg-gray-100 text-xs dark:bg-gray-700">
                                                                {
                                                                    row.children!
                                                                        .length
                                                                }{' '}
                                                                features
                                                            </Tag>
                                                            {!row.isActive && (
                                                                <InactiveTag />
                                                            )}
                                                        </button>
                                                    </td>
                                                    <ActionCells
                                                        rows={row.children!}
                                                        label={row.name}
                                                        disabled={disabled}
                                                        onToggle={(
                                                            field,
                                                            value,
                                                        ) =>
                                                            updateRows(
                                                                group.code,
                                                                (_, parent) =>
                                                                    parent?.code ===
                                                                    row.code,
                                                                (r) =>
                                                                    applyToggle(
                                                                        r,
                                                                        field,
                                                                        value,
                                                                    ),
                                                            )
                                                        }
                                                    />
                                                </tr>
                                            )
                                            return isOpen
                                                ? [
                                                      header,
                                                      ...row.children!.map(
                                                          (child) =>
                                                              renderLeaf(
                                                                  group.code,
                                                                  child,
                                                                  'pl-16',
                                                              ),
                                                      ),
                                                  ]
                                                : [header]
                                        })}
                                    </tbody>
                                )}
                            </table>
                        </div>
                    </AdaptiveCard>
                )
            })}
        </>
    )
}

export default PermissionMatrix
