import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';

export enum USER_ROLE {
  CUSTOMER = 'CUSTOMER',
  PUROHIT = 'PUROHIT',
  ADMIN = 'ADMIN',
}

export enum USER_STATUS {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  REJECTED = 'REJECTED',
  BLOCKED = 'BLOCKED',
  PENDING = 'PENDING',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  // Basic Info
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150 })
  email!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  username!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 15, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  emergencyContact?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  profileImage?: string;

  // Authentication
  @Column({ type: 'varchar', length: 255 })
  hashedPassword!: string;

  @Column({ type: 'varchar', nullable: true })
  hashedRefreshToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @Column({ default: 1 })
  tokenVersion!: number;

  // Role & Status
  @Column({
    type: 'enum',
    enum: USER_ROLE,
    default: USER_ROLE.CUSTOMER,
  })
  role!: USER_ROLE;

  @Column({
    type: 'enum',
    enum: USER_STATUS,
    default: USER_STATUS.ACTIVE,
  })
  status!: USER_STATUS;

  // Timestamps
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
