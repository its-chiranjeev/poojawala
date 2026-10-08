import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ACTOR_TYPE {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
  WEBHOOK = 'WEBHOOK',
}

export enum AUDIT_MODULE {
  BOOKING = 'BOOKING',
  PAYMENT = 'PAYMENT',
  PAYOUT = 'PAYOUT',
  USER = 'USER',
  AUTH = 'AUTH',
  COMPLAINT = 'COMPLAINT',
  REVIEW = 'REVIEW',
  COUPON = 'COUPON',
  SERVICE = 'SERVICE',
  SYSTEM = 'SYSTEM',
  SETTING = 'SETTING',
  CONTACT_US = 'CONTACT_US',
  PRODUCT = 'PRODUCT',
  BLOG = 'BLOG',
  TEMPLE = 'TEMPLE',
}

@Entity('audit_logs')
@Index(['entity', 'entityId', 'createdAt'])
@Index(['module', 'createdAt'])
@Index(['actorId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  // ACTOR INFORMATION
  @Column({ type: 'int', nullable: true })
  actorId?: number | null; // null for SYSTEM/WEBHOOK

  @Column({ type: 'enum', enum: ACTOR_TYPE, default: ACTOR_TYPE.USER })
  actorType!: ACTOR_TYPE;

  @Column({ type: 'varchar', length: 50, nullable: true })
  actorRole?: string;

  // ENTITY & MODULE
  @Column({ type: 'enum', enum: AUDIT_MODULE })
  module!: AUDIT_MODULE;

  @Column({ type: 'varchar', length: 100 })
  entity!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entityId?: string; // VARCHAR to support numeric/UUIDs. Nullable ONLY for system-wide events.

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'text' })
  message!: string; // Clear human-readable explanation

  // DATA CHANGES (Sanitized, exact fields only)
  @Column({ type: 'jsonb', nullable: true })
  oldValue?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  newValue?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // REQUEST CONTEXT (No HTTP context/status)
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  requestId?: string;

  // TIMESTAMP
  @CreateDateColumn()
  createdAt!: Date;
}
