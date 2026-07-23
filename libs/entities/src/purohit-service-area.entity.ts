import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { PurohitProfile } from './purohit-profile.entity';

@Entity('purohit_service_areas')
@Unique(['purohitId', 'pincode'])
export class PurohitServiceArea {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  purohitId!: number;

  @ManyToOne(() => PurohitProfile, (profile) => profile.serviceAreas, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purohit_id' })
  purohit!: PurohitProfile;

  @Column({ type: 'varchar', length: 10 })
  pincode!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
