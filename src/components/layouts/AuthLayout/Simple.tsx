import Container from '@/components/shared/Container'
import type { ReactNode } from 'react'
import type { CommonProps } from '@/@types/common'

interface SimpleProps extends CommonProps {
    content?: ReactNode
}

const Simple = ({ children, content }: SimpleProps) => {
    return (
        <div className="h-full bg-white dark:bg-gray-800">
            <Container className="flex flex-col flex-auto items-center justify-center min-w-0 h-full">
                <div className="min-w-[320px] md:min-w-[400px] max-w-[400px]">
                    <div>
                        {content}
                        {children}
                    </div>
                </div>
            </Container>
        </div>
    )
}

export default Simple
