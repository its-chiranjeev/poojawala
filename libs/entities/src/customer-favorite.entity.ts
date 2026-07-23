import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
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
  @JoinColumn({ name: 'customer_id' })
  customer!: User;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (purohit) => purohit.favoritedBy, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohit_id' })
  purohit!: PurohitProfile;

  @CreateDateColumn()
  createdAt!: Date;
}
