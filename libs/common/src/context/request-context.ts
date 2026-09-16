import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export interface RequestStore {
  ipAddress?: string;
  requestId?: string;
}

export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<RequestStore>();

  static run<R>(store: RequestStore, callback: () => R): R {
    return this.storage.run(store, callback);
  }

  static getStore(): RequestStore | undefined {
    return this.storage.getStore();
  }

  static getIp(): string | undefined {
    return this.storage.getStore()?.ipAddress;
  }

  static getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}

/**
 * Extracts client IP from request, taking proxy headers into account.
 */
export function extractClientIp(req: any): string | undefined {
  if (!req) return undefined;

  let ip: string | undefined;

  // 1. Cloudflare header
  const cfConnectingIp = req.headers?.['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim().length > 0) {
    ip = cfConnectingIp.trim();
  }

  // 2. Standard X-Forwarded-For (proxy / load balancer / reverse proxy like Nginx or AWS ALB)
  if (!ip) {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
      ip = forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      ip = forwarded[0].trim();
    }
  }

  // 3. X-Real-IP (Nginx standard)
  if (!ip) {
    const realIp = req.headers?.['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim().length > 0) {
      ip = realIp.trim();
    }
  }

  // 4. Other custom headers (X-Client-IP, True-Client-IP)
  if (!ip) {
    const clientIp = req.headers?.['x-client-ip'] || req.headers?.['true-client-ip'];
    if (typeof clientIp === 'string' && clientIp.trim().length > 0) {
      ip = clientIp.trim();
    }
  }

  // 5. Express req.ip or raw socket remote address
  if (!ip) {
    ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
  }

  // Strip IPv6-mapped IPv4 prefix (e.g., ::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // Convert IPv6 loopback to IPv4 localhost
  if (ip === '::1' || ip === '::') {
    ip = '127.0.0.1';
  }

  return ip;
}

/**
 * NestJS Middleware for Request Context
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (RequestContext.getStore()) {
      return next();
    }

    const ipAddress = extractClientIp(req);
    const requestId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      randomUUID();

    if (res && typeof res.setHeader === 'function' && !res.headersSent) {
      res.setHeader('X-Request-Id', requestId);
    }

    RequestContext.run({ ipAddress, requestId }, () => next());
  }
}

/**
 * Express Middleware function for Request Context (for use in main.ts)
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (RequestContext.getStore()) {
    return next();
  }

  const ipAddress = extractClientIp(req);
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    randomUUID();

  if (res && typeof res.setHeader === 'function' && !res.headersSent) {
    res.setHeader('X-Request-Id', requestId);
  }

  RequestContext.run({ ipAddress, requestId }, () => next());
}
