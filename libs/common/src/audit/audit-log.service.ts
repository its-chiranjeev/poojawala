import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, ACTOR_TYPE, AUDIT_MODULE } from '@poojawala/entities';
import { RequestContext } from '../context/request-context';

export interface CreateAuditLogDto {
  actorId?: number | null;
  actorType?: ACTOR_TYPE;
  actorRole?: string;
  module: AUDIT_MODULE;
  entity: string;
  entityId?: string;
  action: string;
  message: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  requestId?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  // Sensitive fields to mask
  private readonly SENSITIVE_FIELDS = [
    'password',
    'hashedPassword',
    'otp',
    'accessToken',
    'refreshToken',
    'poojawala-admin-access-token',
    'poojawala-admin-refresh-token',
    'poojawala-customer-access-token',
    'poojawala-customer-refresh-token',
    'poojawala-purohit-access-token',
    'poojawala-purohit-refresh-token',
    'hashedRefreshToken',
    'cvv',
    'cardNumber',
    'upiPin',
    'apiSecret',
    'razorpaySecret',
    'privateCredential',
    'accountNumber',
    'ifsc',
  ];

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) { }

  /**
   * Safely create and persist an audit log.
   */
  async createAuditLog(dto: CreateAuditLogDto, queryRunner?: any): Promise<void> {
    try {
      const safeOldValue = this.sanitize(dto.oldValue);
      const safeNewValue = this.sanitize(dto.newValue);
      const safeMetadata = this.sanitize(dto.metadata);

      const ipAddress = dto.ipAddress || RequestContext.getIp();
      const requestId = dto.requestId || RequestContext.getRequestId();

      const auditLog = this.auditLogRepository.create({
        ...dto,
        ipAddress,
        requestId,
        oldValue: safeOldValue,
        newValue: safeNewValue,
        metadata: safeMetadata,
      });

      if (queryRunner && queryRunner.manager) {
        await queryRunner.manager.save(AuditLog, auditLog);
      } else {
        await this.auditLogRepository.save(auditLog);
      }
    } catch (error) {
      // We log the error but don't throw to prevent breaking business logic
      this.logger.error('Failed to create audit log', error);
    }
  }

  /**
   * Recursively sanitizes objects to mask sensitive data.
   */
  private sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    if (typeof data === 'object') {
      const sanitizedObj: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isSensitiveField(key)) {
          sanitizedObj[key] = this.maskValue(key, value);
        } else {
          sanitizedObj[key] = this.sanitize(value);
        }
      }
      return sanitizedObj;
    }

    return data;
  }

  private isSensitiveField(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.SENSITIVE_FIELDS.some(
      (field) => lowerKey.includes(field.toLowerCase()),
    );
  }

  private maskValue(key: string, value: any): string {
    if (!value) return String(value);

    const lowerKey = key.toLowerCase();
    const strValue = String(value);

    // Specific masking rules
    if (lowerKey.includes('accountnumber')) {
      if (strValue.length > 4) {
        return '********' + strValue.slice(-4);
      }
      return '****';
    }

    if (lowerKey.includes('ifsc')) {
      if (strValue.length > 7) {
        return strValue.slice(0, 4) + '****' + strValue.slice(-3);
      }
      return '****';
    }

    // Generic mask
    return '********';
  }

  /**
   * Get paginated audit logs with optional filters
   */
  async findAuditLogs(query: {
    page?: number;
    limit?: number;
    actorId?: number;
    module?: AUDIT_MODULE;
    action?: string;
    entityId?: string;
  }) {
    const { page = 1, limit = 10, actorId, module, action, entityId } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.auditLogRepository.createQueryBuilder('auditLog');

    if (actorId) {
      queryBuilder.andWhere('auditLog.actorId = :actorId', { actorId });
    }
    if (module) {
      queryBuilder.andWhere('auditLog.module = :module', { module });
    }
    if (action) {
      queryBuilder.andWhere('auditLog.action = :action', { action });
    }
    if (entityId) {
      queryBuilder.andWhere('auditLog.entityId = :entityId', { entityId });
    }

    queryBuilder.orderBy('auditLog.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
