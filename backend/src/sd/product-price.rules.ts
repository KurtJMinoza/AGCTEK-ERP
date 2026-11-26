import { BadRequestException } from '@nestjs/common'

/**
 * Shared cross-field validation: compare-at / original price must be strictly
 * greater than the effective selling price when both are provided.
 *
 * - compareAt / original == null → OK (no promo)
 * - compareAt / original <= sellPrice → 400, field will be cleared
 * - compareAt / original > sellPrice → OK (display strikethrough)
 */
export function assertCompareAt(
  sellPrice: number,
  compareAt?: number | null,
  field = 'compareAtPrice',
) {
  if (compareAt != null && compareAt <= sellPrice) {
    throw new BadRequestException(
      `${field} must be higher than the selling price (${sellPrice}) when set; ` +
        `leave it empty when there is no discount`,
    )
  }
}