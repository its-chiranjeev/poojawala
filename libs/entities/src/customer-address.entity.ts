import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Booking } from './booking.entity';

export enum VENUE_TYPE {
  HOME = 'HOME',
  TEMPLE = 'TEMPLE',
  ONLINE = 'ONLINE',
}

@Entity('customer_addresses')
export class CustomerAddress {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  customerId!: number;

  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: User;

  @Column({
    type: 'enum',
    enum: VENUE_TYPE,
    default: VENUE_TYPE.HOME,
  })
  venueType!: VENUE_TYPE;

  @Column({ type: 'varchar', length: 50 })
  addressLabel!: string;

  @Column({ type: 'text' })
  fullAddress!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 10 })
  pincode!: string;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @OneToMany(() => Booking, (booking) => booking.customerAddress)
  bookings!: Booking[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
