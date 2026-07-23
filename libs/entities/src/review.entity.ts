import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Booking } from './booking.entity';
import { User } from './user.entity';
import { PurohitProfile } from './purohit-profile.entity';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'int', unique: true })
  bookingId!: number;

  @OneToOne(() => Booking, (booking) => booking.review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ type: 'int' })
  customerId!: number;

  @ManyToOne(() => User, (user) => user.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: User;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (purohit) => purohit.reviews, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohit_id' })
  purohit!: PurohitProfile;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ type: 'boolean', default: true })
  isVisible!: boolean;

  @Column({ type: 'text', nullable: true })
  adminResponse?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
