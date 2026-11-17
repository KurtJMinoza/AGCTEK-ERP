import { BadRequestException } from '@nestjs/common'

/**
 * Validates that discountedPrice is strictly lower than selling price when set.
 * - discounted == null → OK (no discount)
 * - discounted <= 0 → 400
 * - discounted >= selling → 400, field will be cleared
 * - discounted < selling → OK (display strikethrough)
 */
export function assertDiscountedLowerThanSelling(
  sellingPrice: number,
  discountedPrice?: number | null,
  field = 'discountedPrice',
) {
  if (discountedPrice == null) {
    return // no discount, OK
  }
  if (discountedPrice <= 0) {
    throw new BadRequestException(
      `${field} must be greater than zero when set`,
    )
  }
  if (discountedPrice >= sellingPrice) {
    throw new BadRequestException(
      `${field} must be lower than the selling price (${sellingPrice}) when set; ` +
        `leave it empty when there is no discount`,
    )
  }
}