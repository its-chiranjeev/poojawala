import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { TempleAarti } from './temple-aarti.entity';

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;

  @OneToMany(() => TempleAarti, (aarti) => aarti.temple)
  aartis!: TempleAarti[];
}
