import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  { success: boolean; statusCode: number; message: string; data: T }
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<{
    success: boolean;
    statusCode: number;
    message: string;
    data: T;
  }> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'statusCode' in data
        ) {
          return data;
        }

        const message =
          data &&
          typeof data === 'object' &&
          'message' in (data as Record<string, unknown>)
            ? String((data as Record<string, unknown>).message)
            : 'Request successful';

        return {
          success: true,
          statusCode: response.statusCode,
          message,
          data,
        };
      }),
    );
  }
}
