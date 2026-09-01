import Loading from '@/components/shared/Loading'

const loading = () => {
    return (
        <div className="flex flex-auto flex-col h-full">
            <Loading loading={true} />
        </div>
    )
}

export default loading
