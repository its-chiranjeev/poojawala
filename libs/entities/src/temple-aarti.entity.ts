import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Temple } from './temple.entity';

@Entity('temple_aartis')
export class TempleAarti {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'int' })
  templeId!: number;

  @ManyToOne(() => Temple, (temple) => temple.aartis, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'templeId' })
  temple!: Temple;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  slug?: string | null;

  @Column({ type: 'time', nullable: true })
  time?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;
}
