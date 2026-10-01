'use client'

import SubmoduleHubPage from '@/components/erp/SubmoduleHubPage'

/** Transportation Management hub — same ERP hub UI as MM submodule hubs. */
export default function ScmDashboard() {
    return (
        <SubmoduleHubPage moduleCode="scm" submoduleCode="transportation" />
    )
}
