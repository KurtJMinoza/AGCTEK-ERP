'use client'

import classNames from 'classnames'
import type { CrmEmailFolder } from '../services/crmEmailService'

const FOLDERS: { id: CrmEmailFolder | 'templates'; label: string }[] = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'starred', label: 'Starred' },
    { id: 'sent', label: 'Sent' },
    { id: 'drafts', label: 'Drafts' },
    { id: 'spam', label: 'Spam' },
    { id: 'templates', label: 'Templates' },
]

export default function EmailFolderNav({
    active,
    onChange,
}: {
    active: CrmEmailFolder | 'templates'
    onChange: (folder: CrmEmailFolder | 'templates') => void
}) {
    return (
        <nav className="flex flex-col gap-0.5">
            {FOLDERS.map((folder) => (
                <button
                    key={folder.id}
                    type="button"
                    onClick={() => onChange(folder.id)}
                    className={classNames(
                        'rounded-lg px-3 py-2 text-left text-sm transition',
                        active === folder.id
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
                    )}
                >
                    {folder.label}
                </button>
            ))}
        </nav>
    )
}
