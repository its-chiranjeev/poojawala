import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : Array.isArray(
              (exceptionResponse as { message?: string | string[] } | null)
                ?.message,
            )
          ? ((exceptionResponse as { message?: string[] }).message?.[0] ??
            'Request failed')
          : (exceptionResponse as { message?: string } | null)?.message ||
            (exception instanceof Error
              ? exception.message
              : 'Internal server error');

    const error =
      typeof exceptionResponse === 'string'
        ? 'Request failed'
        : (exceptionResponse as { error?: string } | null)?.error ||
          (status === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'Internal Server Error'
            : 'Request failed');

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      error,
    });
  }
}
