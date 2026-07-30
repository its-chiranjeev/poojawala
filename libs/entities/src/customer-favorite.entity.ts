import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  DeleteDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { PurohitProfile } from './purohit-profile.entity';

@Entity('customer_favorites')
@Unique(['customerId', 'purohitId'])
export class CustomerFavorite {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  customerId!: number;

  @ManyToOne(() => User, (user) => user.favorites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer!: User;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (purohit) => purohit.favoritedBy, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohitId' })
  purohit!: PurohitProfile;

  @CreateDateColumn()
  createdAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}