'use client'

import { useCallback, useEffect, useState } from 'react'
import { HiOutlinePencilAlt, HiOutlineRefresh } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import usePermissions from '@/utils/hooks/usePermissions'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import EmailTemplatesSection from '../components/EmailTemplatesSection'
import EmailFolderNav from '../components/EmailFolderNav'
import EmailMessageList from '../components/EmailMessageList'
import EmailComposeDialog from '../components/EmailComposeDialog'
import EmailReadingPane from '../components/EmailReadingPane'
import {
    listCrmEmails,
    sendCrmEmail,
    setCrmEmailSpam,
    setCrmEmailStarred,
    syncCrmEmailInbound,
    type CrmEmailFolder,
    type CrmEmailMessage,
} from '../services/crmEmailService'

const ROUTE = '/emails'

type View = CrmEmailFolder | 'templates'

/** CRM › Communications › Emails: outbound + MailDev inbound hub. */
export default function EmailsPage() {
    const { can } = usePermissions()
    const canCompose = can('emails.messages', 'create') || can('emails.messages', 'update')
    const canModerate = can('emails.messages', 'update')
    const [folder, setFolder] = useState<View>('sent')
    const [rows, setRows] = useState<CrmEmailMessage[]>([])
    const [selected, setSelected] = useState<CrmEmailMessage | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [composeOpen, setComposeOpen] = useState(false)
    const [editing, setEditing] = useState<CrmEmailMessage | null>(null)
    const [searchInput, setSearchInput] = useState('')
    const [searchQ, setSearchQ] = useState('')
    const [starringId, setStarringId] = useState<string | null>(null)
    const [retrying, setRetrying] = useState(false)
    const [movingSpam, setMovingSpam] = useState(false)
    const [syncing, setSyncing] = useState(false)

    useEffect(() => {
        const handle = window.setTimeout(() => {
            setSearchQ(searchInput.trim())
        }, 300)
        return () => window.clearTimeout(handle)
    }, [searchInput])

    useEffect(() => {
        setSearchInput('')
        setSearchQ('')
        setSelected(null)
        setInfo(null)
    }, [folder])

    const refresh = useCallback(async () => {
        if (folder === 'templates') {
            setRows([])
            setSelected(null)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const data = await listCrmEmails(folder, { q: searchQ || undefined })
            setRows(data)
            setSelected((current) =>
                current ? data.find((row) => row.id === current.id) ?? null : null,
            )
        } catch (err) {
            setRows([])
            setError(getApiErrorMessage(err, 'Unable to load emails'))
        } finally {
            setLoading(false)
        }
    }, [folder, searchQ])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const emptyText =
        folder === 'inbox'
            ? searchQ
                ? 'No inbox mail matches your search.'
                : 'No inbox mail yet.'
            : folder === 'spam'
              ? searchQ
                  ? 'No spam matches your search.'
                  : 'No spam.'
              : folder === 'starred'
                ? searchQ
                    ? 'No starred mail matches your search.'
                    : 'No starred mail yet.'
                : folder === 'drafts'
                  ? searchQ
                      ? 'No drafts match your search.'
                      : 'No drafts.'
                  : searchQ
                    ? 'No sent mail matches your search.'
                    : 'No sent mail yet.'

    const applyMessageUpdate = (updated: CrmEmailMessage) => {
        setRows((prev) => {
            if (folder === 'starred' && !updated.starred) {
                return prev.filter((row) => row.id !== updated.id)
            }
            if (folder === 'inbox' && updated.isSpam) {
                return prev.filter((row) => row.id !== updated.id)
            }
            if (folder === 'spam' && !updated.isSpam) {
                return prev.filter((row) => row.id !== updated.id)
            }
            return prev.map((row) => (row.id === updated.id ? updated : row))
        })
        setSelected((current) => {
            if (!current || current.id !== updated.id) return current
            if (folder === 'starred' && !updated.starred) return null
            if (folder === 'inbox' && updated.isSpam) return null
            if (folder === 'spam' && !updated.isSpam) return null
            return updated
        })
    }

    const handleToggleStar = async (message: CrmEmailMessage) => {
        if (!canModerate) return
        setStarringId(message.id)
        setError(null)
        try {
            const updated = await setCrmEmailStarred(message.id, !message.starred)
            applyMessageUpdate(updated)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to update star'))
        } finally {
            setStarringId(null)
        }
    }

    const handleSetSpam = async (message: CrmEmailMessage, isSpam: boolean) => {
        if (!canModerate) return
        setMovingSpam(true)
        setError(null)
        try {
            const updated = await setCrmEmailSpam(message.id, isSpam)
            applyMessageUpdate(updated)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to update spam folder'))
        } finally {
            setMovingSpam(false)
        }
    }

    const handleRetry = async (message: CrmEmailMessage) => {
        setRetrying(true)
        setError(null)
        try {
            const updated = await sendCrmEmail(message.id)
            applyMessageUpdate(updated)
            if (folder === 'sent' || folder === 'starred') {
                void refresh()
            }
        } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to resend email'))
        } finally {
            setRetrying(false)
        }
    }

    const handleSync = async () => {
        if (!canModerate) return
        setSyncing(true)
        setError(null)
        setInfo(null)
        try {
            const result = await syncCrmEmailInbound()
            setInfo(
                `Synced MailDev: ${result.imported} imported, ${result.skipped} skipped (${result.fetched} fetched).`,
            )
            if (folder === 'inbox' || folder === 'spam' || folder === 'starred') {
                await refresh()
            }
        } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to sync MailDev inbox'))
        } finally {
            setSyncing(false)
        }
    }

    return (
        <PageContainer>
            <PageHeader
                title="Emails"
                description="CRM emailer: compose, drafts, sent, MailDev inbox/spam, and quotation cover templates."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            disabled={!canModerate || syncing}
                            loading={syncing}
                            onClick={() => {
                                void handleSync()
                            }}
                        >
                            Sync now
                        </Button>
                        <Button
                            variant="solid"
                            icon={<HiOutlinePencilAlt />}
                            disabled={!canCompose}
                            onClick={() => {
                                setEditing(null)
                                setComposeOpen(true)
                            }}
                        >
                            Compose
                        </Button>
                    </div>
                }
            />

            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.1fr)]">
                <AdaptiveCard className="h-fit p-3">
                    <EmailFolderNav active={folder} onChange={setFolder} />
                </AdaptiveCard>

                <AdaptiveCard className="min-h-[28rem] overflow-hidden p-0">
                    {folder === 'templates' ? (
                        <div className="p-4">
                            <EmailTemplatesSection
                                canEdit={can('emails.templates', 'update')}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="border-b border-gray-200 p-3 dark:border-gray-700">
                                <Input
                                    placeholder="Search this folder…"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                />
                            </div>
                            {error ? (
                                <Alert showIcon type="danger" className="m-4">
                                    {error}
                                </Alert>
                            ) : null}
                            {info ? (
                                <Alert showIcon type="success" className="m-4">
                                    {info}
                                </Alert>
                            ) : null}
                            <EmailMessageList
                                rows={rows}
                                selectedId={selected?.id ?? null}
                                loading={loading}
                                emptyText={emptyText}
                                canStar={canModerate}
                                starringId={starringId}
                                onSelect={(message) => {
                                    setSelected(message)
                                    if (message.status === 'DRAFT') {
                                        setEditing(message)
                                        setComposeOpen(true)
                                    }
                                }}
                                onToggleStar={(message) => {
                                    void handleToggleStar(message)
                                }}
                            />
                        </>
                    )}
                </AdaptiveCard>

                <AdaptiveCard className="min-h-[28rem] p-4">
                    {folder === 'templates' ? (
                        <p className="text-sm text-gray-500">
                            Edit cover-letter templates used when emailing quotations.
                        </p>
                    ) : (
                        <EmailReadingPane
                            message={selected}
                            canStar={canModerate}
                            canModerate={canModerate}
                            starring={starringId === selected?.id}
                            retrying={retrying}
                            movingSpam={movingSpam}
                            onToggleStar={(message) => {
                                void handleToggleStar(message)
                            }}
                            onEdit={(message) => {
                                setEditing(message)
                                setComposeOpen(true)
                            }}
                            onRetry={(message) => {
                                void handleRetry(message)
                            }}
                            onSetSpam={(message, isSpam) => {
                                void handleSetSpam(message, isSpam)
                            }}
                        />
                    )}
                </AdaptiveCard>
            </div>

            <EmailComposeDialog
                open={composeOpen}
                initial={editing}
                onClose={() => {
                    setComposeOpen(false)
                    setEditing(null)
                }}
                onSaved={() => {
                    if (folder === 'templates') setFolder('sent')
                    else void refresh()
                }}
            />
        </PageContainer>
    )
}
