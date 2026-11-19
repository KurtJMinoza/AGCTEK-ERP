/**
 * Minimal Code 128 (code set B) encoder for printed receipts.
 *
 * Code set B covers every printable ASCII character, which is all a receipt
 * number needs. Each symbol is 3 bars + 3 spaces that add up to 11 modules; the
 * stop symbol has a final 2-module bar (13 modules).
 */

/** Bar/space widths for symbols 0–106, starting with a bar. */
const PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213',
    '122312', '132212', '221213', '221312', '231212', '112232', '122132',
    '122231', '113222', '123122', '123221', '223211', '221132', '221231',
    '213212', '223112', '312131', '311222', '321122', '321221', '312212',
    '322112', '322211', '212123', '212321', '232121', '111323', '131123',
    '131321', '112313', '132113', '132311', '211313', '231113', '231311',
    '112133', '112331', '132131', '113123', '113321', '133121', '313121',
    '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111',
    '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114',
    '413111', '241112', '134111', '111242', '121142', '121241', '114212',
    '124112', '124211', '411212', '421112', '421211', '212141', '214121',
    '412121', '111143', '111341', '131141', '114113', '114311', '411113',
    '411311', '113141', '114131', '311141', '411131', '211412', '211214',
    '211232', '2331112',
] as const

const START_B = 104
const STOP = 106

export const CODE128_PATTERNS = PATTERNS

/** Whether every character can be encoded in code set B. */
export const isCode128Encodable = (value: string) =>
    value.length > 0 && [...value].every((ch) => ch >= ' ' && ch <= '~')

/** Symbol values (start, data, checksum, stop) for a code set B string. */
export function code128Symbols(value: string): number[] {
    if (!isCode128Encodable(value)) {
        throw new Error('Code 128 (set B) supports printable ASCII only.')
    }
    const data = [...value].map((ch) => ch.charCodeAt(0) - 32)
    const checksum =
        (START_B + data.reduce((sum, code, index) => sum + code * (index + 1), 0)) %
        103
    return [START_B, ...data, checksum, STOP]
}

export type Code128Bars = {
    /** Bars as [x, width] in modules; spaces are the gaps between them. */
    bars: Array<[number, number]>
    /** Total width in modules, without quiet zones. */
    modules: number
}

/** Bar layout of a code set B barcode (quiet zones are added by the renderer). */
export function encodeCode128(value: string): Code128Bars {
    const bars: Array<[number, number]> = []
    let x = 0
    for (const symbol of code128Symbols(value)) {
        const widths = PATTERNS[symbol]
        for (let i = 0; i < widths.length; i++) {
            const width = Number(widths[i])
            if (i % 2 === 0) bars.push([x, width])
            x += width
        }
    }
    return { bars, modules: x }
}
