import Loading from '@/components/shared/Loading'

/**
 * Instant feedback while the MM client page chunk mounts.
 * Avoids a blank content pane on every module click.
 */
export default function MmLoading() {
    return (
        <div className="flex flex-auto flex-col h-full min-h-[40vh]">
            <Loading loading={true} />
        </div>
    )
}
