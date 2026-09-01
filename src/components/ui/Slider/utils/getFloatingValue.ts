function getFloatingValue(value: number, precision: number) {
    return parseFloat(value.toFixed(precision))
}

export default getFloatingValue
