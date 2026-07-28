import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum CMS_CONTENT_TYPE {
  BANNER = 'BANNER',
  FAQ = 'FAQ',
  BLOG_ARTICLE = 'BLOG_ARTICLE',
  FESTIVAL_PROMOTION = 'FESTIVAL_PROMOTION',
}

@Entity('cms_content')
export class CmsContent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'enum',
    enum: CMS_CONTENT_TYPE,
    default: CMS_CONTENT_TYPE.BANNER,
  })
  contentType!: CMS_CONTENT_TYPE;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200, nullable: true, unique: true })
  slug?: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  imageUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkUrl?: string;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startsAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  endsAt?: Date;

  @Column({ type: 'varchar', length: 200, nullable: true })
  metaTitle?: string;

  @Column({ type: 'text', nullable: true })
  metaDescription?: string;

  @Column({ type: 'int' })
  createdById!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy!: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}