import Image from 'next/image'
import { HiOutlineCube, HiOutlineFire, HiOutlineMinus, HiOutlinePlus } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import classNames from '@/utils/classNames'
import { isUnoptimizedImage } from '@/utils/productImage'
import type { LpgProduct, LpgProductCategory } from '@/modules/sd/catalogs/lpgCatalog'

export const ORANGE_BUTTON = () => 'bg-orange-500 hover:bg-orange-600 text-white'

export const TAG_CLASS: Record<LpgProductCategory, string> = {
    'Brand-New': 'bg-orange-500 text-white border-0',
    Refill: 'bg-orange-100 text-orange-700 border-0 dark:bg-orange-500/20 dark:text-orange-200',
    'Add-on': 'bg-gray-100 text-gray-700 border-0 dark:bg-gray-700 dark:text-gray-200',
}

export const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

export const LpgProductVisual = ({
    product,
    src,
    size = 'md',
    className,
}: {
    product: LpgProduct
    src?: string | null
    size?: 'sm' | 'md' | 'lg'
    className?: string
}) => {
    const Icon = product.category === 'Add-on' ? HiOutlineCube : HiOutlineFire
    return (
        <div
            className={classNames(
                'relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 dark:from-gray-700 dark:to-gray-800',
                className,
            )}
        >
            {src ? (
                <Image
                    src={src}
                    alt={product.name}
                    fill
                    sizes={size === 'lg' ? '(max-width: 768px) 100vw, 480px' : '240px'}
                    unoptimized={isUnoptimizedImage(src)}
                    className="object-contain"
                />
            ) : (
                <div className="flex flex-col items-center text-orange-500">
                    <Icon
                        className={
                            size === 'lg'
                                ? 'text-8xl'
                                : size === 'sm'
                                  ? 'text-2xl'
                                  : 'text-5xl sm:text-7xl'
                        }
                        aria-hidden
                    />
                    {product.weightKg && size !== 'sm' ? (
                        <span className="mt-1 text-sm font-bold">{product.weightKg} kg</span>
                    ) : null}
                </div>
            )}
        </div>
    )
}

export const QuantityStepper = ({
    quantity,
    label,
    onDecrease,
    onIncrease,
    decreaseDisabled,
}: {
    quantity: number
    label: string
    onDecrease: () => void
    onIncrease: () => void
    decreaseDisabled?: boolean
}) => (
    <div className="flex items-center gap-2">
        <Button
            size="sm"
            shape="circle"
            variant="default"
            className="!h-8 !w-8 border-orange-500 text-orange-500"
            icon={<HiOutlineMinus />}
            aria-label={`Decrease ${label}`}
            disabled={decreaseDisabled}
            onClick={onDecrease}
        />
        <span className="w-6 text-center font-bold heading-text">{quantity}</span>
        <Button
            size="sm"
            shape="circle"
            variant="solid"
            className="!h-8 !w-8"
            customColorClass={ORANGE_BUTTON}
            icon={<HiOutlinePlus />}
            aria-label={`Increase ${label}`}
            onClick={onIncrease}
        />
    </div>
)
