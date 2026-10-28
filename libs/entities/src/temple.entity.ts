import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TempleAarti } from './temple-aarti.entity';
import { User } from './user.entity';

export enum TEMPLE_VERIFICATION_STATUS {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('temples')
export class Temple {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  slug?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  metaTitle?: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  imageUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  primaryDeity?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  trustName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'time', nullable: true })
  openingTime?: string | null;

  @Column({ type: 'time', nullable: true })
  closingTime?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  trustRegNo?: string | null;

  @Column({ type: 'text', nullable: true })
  trustDocUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  deityPhotoUrl?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  submittedByUserId?: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'submittedByUserId' })
  submittedByUser?: User | null;

  @Column({
    type: 'enum',
    enum: TEMPLE_VERIFICATION_STATUS,
    default: TEMPLE_VERIFICATION_STATUS.APPROVED,
  })
  verificationStatus!: TEMPLE_VERIFICATION_STATUS;

  @Column({ type: 'text', nullable: true })
  verificationRemarks?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;

  @OneToMany(() => TempleAarti, (aarti) => aarti.temple)
  aartis!: TempleAarti[];
}
