import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Type,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { Observable, map } from 'rxjs';
import { SERIALIZE_DTO_KEY } from '../decorators/serializeDto.decorator';
import { isPaginatedResponse } from '../utils/pagination.util';

/**
 * Transforms localized (or other) plain objects into a response DTO when
 * {@link SerializeDto} is set on the handler or controller class.
 */
@Injectable()
export class SerializeDtoInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const dtoClass = this.reflector.getAllAndOverride<Type>(SERIALIZE_DTO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((data) => {
        if (!dtoClass) {
          return data;
        }
        console.log(data);
        if (isPaginatedResponse(data)) {
          return {
            ...data,
            data: plainToInstance(dtoClass, data.data, {
              excludeExtraneousValues: true,
            }),
          };
        }
        return plainToInstance(dtoClass, data, {
          excludeExtraneousValues: true,
        });
      }),
    );
  }
}
