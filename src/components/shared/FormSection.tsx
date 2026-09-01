import Card from '@/components/ui/Card'
import classNames from '@/utils/classNames'
import type { ReactNode } from 'react'

type FormSectionProps = {
    title: ReactNode
    description?: ReactNode
    children: ReactNode
    className?: string
    bodyClass?: string
}

const FormSection = ({
    title,
    description,
    children,
    className,
    bodyClass,
}: FormSectionProps) => {
    return (
        <Card
            className={className}
            header={{
                content: (
                    <div>
                        <h4 className="text-base font-semibold">{title}</h4>
                        {description ? (
                            <p className="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
                                {description}
                            </p>
                        ) : null}
                    </div>
                ),
            }}
            bodyClass={classNames('pt-0', bodyClass)}
        >
            {children}
        </Card>
    )
}

export default FormSection
