import Image from 'next/image'

type SceneAsset = {
    src: string
    width: number
    height: number
    className: string
}

const asset = (
    name: string,
    width: number,
    height: number,
    className: string,
): SceneAsset => ({
    src: `/storefront/auth-scene/${name}.png`,
    width,
    height,
    className,
})

/** Faint, tiny, slightly blurred: the deepest layer. */
const BACKGROUND: SceneAsset[] = [
    asset(
        'star',
        256,
        247,
        'left-[16%] top-[7%] w-12 motion-safe:animate-slow-spin',
    ),
    asset(
        'coin',
        256,
        243,
        'right-[18%] top-[16%] w-14 motion-safe:animate-float [animation-delay:-2s] [animation-duration:9s]',
    ),
    asset(
        'card',
        256,
        196,
        'bottom-[30%] left-[4%] w-20 rotate-12 motion-safe:animate-float [animation-delay:-4s] [animation-duration:10s]',
    ),
    asset(
        'parcel',
        512,
        465,
        'right-[4%] top-[46%] w-12 -rotate-6 motion-safe:animate-float [animation-delay:-1s] [animation-duration:8s]',
    ),
    asset(
        'star',
        256,
        247,
        'bottom-[6%] right-[34%] w-10 motion-safe:animate-slow-spin [animation-direction:reverse]',
    ),
    asset(
        'coin',
        256,
        243,
        'bottom-[44%] left-[30%] w-8 motion-safe:animate-float [animation-delay:-3s] [animation-duration:11s]',
    ),
]

/** Sharp hero products around the centre cluster. */
const MIDGROUND: SceneAsset[] = [
    asset(
        'fridge',
        301,
        640,
        'left-[5%] top-[9%] w-24 -rotate-6 xl:w-28 motion-safe:animate-float',
    ),
    asset(
        'lpg',
        283,
        512,
        'right-[7%] top-[11%] w-20 rotate-6 xl:w-24 motion-safe:animate-float [animation-delay:-2.5s] [animation-duration:7s]',
    ),
    asset(
        'microwave',
        512,
        334,
        'bottom-[13%] left-[7%] w-32 rotate-3 xl:w-40 motion-safe:animate-float [animation-delay:-4s] [animation-duration:8s]',
    ),
    asset(
        'parcel',
        512,
        465,
        'bottom-[9%] right-[8%] w-28 -rotate-12 xl:w-32 motion-safe:animate-float [animation-delay:-1.5s] [animation-duration:6.5s]',
    ),
]

/** Large, heavily blurred objects breaking the panel edges. */
const FOREGROUND: SceneAsset[] = [
    asset(
        'bag',
        415,
        512,
        '-bottom-10 -left-10 w-56 -rotate-12 motion-safe:animate-float [animation-duration:12s]',
    ),
    asset(
        'parcel',
        512,
        465,
        '-right-12 -top-10 w-52 rotate-12 motion-safe:animate-float [animation-delay:-6s] [animation-duration:14s]',
    ),
]

const Layer = ({
    assets,
    className,
}: {
    assets: SceneAsset[]
    className: string
}) => (
    <>
        {assets.map(({ src, width, height, className: placement }, index) => (
            <Image
                key={`${src}-${index}`}
                src={src}
                width={width}
                height={height}
                alt=""
                aria-hidden
                draggable={false}
                className={`pointer-events-none absolute h-auto select-none ${className} ${placement}`}
            />
        ))}
    </>
)

/** Decorative 3D retail scene behind the sign-in branding copy. */
const AuthBrandScene = () => (
    <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
    >
        <Layer
            assets={BACKGROUND}
            className="z-0 scale-75 opacity-30 blur-[1px]"
        />
        <Layer
            assets={MIDGROUND}
            className="z-10 drop-shadow-[0_24px_32px_rgba(0,0,0,0.45)]"
        />
        <Layer
            assets={FOREGROUND}
            className="z-[15] scale-125 opacity-40 blur-md"
        />
    </div>
)

export default AuthBrandScene
