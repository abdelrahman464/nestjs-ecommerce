import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

/**
 * Low-stock is NOT time-based — it is a snapshot of inventory_levels *now*.
 *
 * available = quantity - reservedQuantity
 * “Low” means available <= threshold (default 5).
 *
 * Pagination: ?page=1&limit=20 (same shape as other list endpoints).
 */
export class LowStockQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  threshold?: number;

  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
