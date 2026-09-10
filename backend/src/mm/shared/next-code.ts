/**
 * Next sequential code like PREFIX-000001 from the highest existing PREFIX-* code.
 */
export function nextSequentialCode(
    lastCode: string | null | undefined,
    prefix: string,
    pad = 6,
): string {
    let seq = 1
    if (lastCode?.startsWith(prefix)) {
        const num = parseInt(lastCode.slice(prefix.length), 10)
        if (!isNaN(num)) seq = num + 1
    }
    return `${prefix}${String(seq).padStart(pad, '0')}`
}
