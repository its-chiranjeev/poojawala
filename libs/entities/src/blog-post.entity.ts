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
import { BlogCategory } from './blog-category.entity';

export interface BlogPostSection {
  title: string;
  description: string;
}

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

  // TODO: BLOG_POST_SECTIONS_MIGRATION
  // Legacy single content column retained as nullable for schema/backward compatibility.
  // sections[] is now the single source of truth for the blog article body.
  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImage?: string;

  downloadUrl?: string | null;

  @Column({ type: 'varchar', length: 150 })
  authorName!: string;

  // TODO: BLOG_POST_ENHANCEMENT
  // Preserved previous mandatory category relation:
  /*
  @Column({ type: 'int' })
  categoryId!: number;

  @ManyToOne(() => BlogCategory, (category) => category.posts, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categoryId' })
  category!: BlogCategory;
  */

  @Column({ type: 'int', nullable: true })
  categoryId?: number | null;

  @ManyToOne(() => BlogCategory, (category) => category.posts, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'categoryId' })
  blogCategory?: BlogCategory | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category?: string | null;

  @Column({ type: 'int', nullable: true })
  readTime?: number | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () => "'[]'",
  })
  sections?: BlogPostSection[];

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
