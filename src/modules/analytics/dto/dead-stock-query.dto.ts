import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

/**
 * Dead stock = on-hand units with zero paid sales in the last `days` days.
 * Snapshot list (paginated), not a revenue time series.
 */
export class DeadStockQueryDto {
  /** Look-back window for “had any sales?” (default 30). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

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
