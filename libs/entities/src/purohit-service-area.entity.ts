import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('purohit_service_areas')
@Unique(['purohitId', 'pincode'])
export class PurohitServiceArea {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => User, (user) => user.serviceAreas, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohit_id' })
  purohit!: User;

  @Column({ type: 'varchar', length: 50 })
  addressLabel!: string;

  @Column({ type: 'varchar', length: 150 })
  streetName!: string;

  @Column({ type: 'text' })
  fullAddress!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 10 })
  pincode!: string;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}