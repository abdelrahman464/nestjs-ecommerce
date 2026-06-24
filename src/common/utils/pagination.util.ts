import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';

export function isPaginatedResponse(
  value: unknown,
): value is PaginatedResponseDto<unknown> {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as PaginatedResponseDto<unknown>;
  return (
    Array.isArray(candidate.data) &&
    typeof candidate.total === 'number' &&
    typeof candidate.page === 'number' &&
    typeof candidate.limit === 'number' &&
    typeof candidate.totalPages === 'number'
  );
}
