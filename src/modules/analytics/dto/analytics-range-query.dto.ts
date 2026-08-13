import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Shared query for time-bounded analytics endpoints.
 *
 * Example:
 *   GET /analytics/summary?from=2026-01-01&to=2026-01-31&currency=EUR
 *
 * - `from` / `to` are inclusive ISO dates (day or full datetime).
 * - Omit both → “all time” (still filtered by currency if provided).
 * - `currency` keeps EUR and USD from being summed into one fake total.
 */
export class AnalyticsRangeQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** ISO 4217, e.g. EUR — optional filter; when omitted we group by currency. */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /** Cap for ranked lists (top products/variants/customers, slow movers). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Page for paginated ranked lists (top customers, slow movers). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
