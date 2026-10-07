'use client'

import { useRouter } from 'next/navigation'
import { HiOutlineArrowLeft, HiOutlineOfficeBuilding } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import { SALES_BRANCHES, type SalesBranch } from '../catalogs/branchCatalog'
import { productDivisionLabel } from '../catalogs/productDivisions'
import {
    POS_TERMINAL_PATH,
    useActivePOSBranch,
    usePOSBranchStore,
} from '../store/usePOSBranchStore'

/** POS entry: the cashier picks the selling branch before the terminal opens. */
const POSBranchGateway = () => {
    const router = useRouter()
    const selectBranch = usePOSBranchStore((s) => s.selectBranch)
    const { branch: current } = useActivePOSBranch()

    const open = (branch: SalesBranch) => {
        selectBranch(branch)
        router.push(POS_TERMINAL_PATH)
    }

    return (
        <div className="flex min-h-screen w-full flex-col bg-white dark:bg-gray-900">
            <header className="flex items-center justify-between px-6 py-4">
                <span className="text-sm font-semibold tracking-wide text-gray-500 uppercase">
                    POS Terminal
                </span>
                <Button
                    size="sm"
                    variant="plain"
                    icon={<HiOutlineArrowLeft />}
                    onClick={() => router.push('/modules/sd')}
                >
                    Back to ERP
                </Button>
            </header>
            <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
                <h2 className="text-center text-3xl font-bold text-gray-900 dark:text-gray-100">
                    Select Branch
                </h2>
                <p className="mt-2 text-center text-gray-500">
                    Choose the store this terminal is operating in.
                </p>
                <div className="mt-10 grid w-full max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {SALES_BRANCHES.map((branch) => {
                        const isCurrent = current?.id === branch.id
                        return (
                            <Card
                                key={branch.id}
                                clickable
                                role="button"
                                tabIndex={0}
                                aria-label={`Open terminal for ${branch.label}`}
                                className="transition hover:border-primary hover:shadow-lg focus-visible:border-primary focus-visible:outline-none"
                                bodyClass="flex flex-col items-center gap-4 px-6 py-10 text-center"
                                onClick={() => open(branch)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        open(branch)
                                    }
                                }}
                            >
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-3xl text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                    <HiOutlineOfficeBuilding />
                                </div>
                                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {branch.label}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {productDivisionLabel(branch.divisionId)}
                                </div>
                                {isCurrent ? <Tag>Last used</Tag> : null}
                            </Card>
                        )
                    })}
                </div>
            </main>
        </div>
    )
}

export default POSBranchGateway
