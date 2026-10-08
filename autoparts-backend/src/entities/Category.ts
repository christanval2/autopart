import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 100 }) name!: string;
  @Column({ name: 'parent_id', type: 'uuid', nullable: true }) parentId?: string;
  @ManyToOne(() => Category, c => c.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: Category;
  @OneToMany(() => Category, c => c.parent) children!: Category[];
  @Index({ unique: true }) @Column({ length: 150 }) slug!: string;
  @Column({ type: 'int', default: 0 }) depth!: number;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
}
