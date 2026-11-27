export function downloadCsv(filename: string, rows: string[][]) {
    const escape = (cell: string) => {
        if (/[",\n]/.test(cell)) {
            return `"${cell.replace(/"/g, '""')}"`
        }
        return cell
    }
    const csv = rows.map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
}