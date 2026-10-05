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
import { User } from './user.entity';
import { BlogCategory } from './blog-category.entity';

export enum BlogPostStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

@Entity('blog_posts')
@Index(['status'])
@Index(['publishedAt'])
@Index(['categoryId'])
@Index(['isFeatured'])
@Index(['deletedAt'])
export class BlogPost {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  excerpt?: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImage?: string;

  @Column({ type: 'int', nullable: true })
  authorId?: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorId' })
  author?: User;

  @Column({ type: 'int' })
  categoryId!: number;

  @ManyToOne(() => BlogCategory, (category) => category.posts, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categoryId' })
  category!: BlogCategory;

  @Column({
    type: 'enum',
    enum: BlogPostStatus,
    default: BlogPostStatus.PUBLISHED,
  })
  status!: BlogPostStatus;

  @Column({ type: 'boolean', default: false })
  isFeatured!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  publishedAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  metaTitle?: string;

  @Column({ type: 'text', nullable: true })
  metaDescription?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
