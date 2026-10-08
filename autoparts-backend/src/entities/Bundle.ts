import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { BundleItem } from './BundleItem';

@Entity('bundles')
export class Bundle {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 255 }) name!: string;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Column({ name: 'bundle_price', type: 'decimal', precision: 12, scale: 2 }) bundlePrice!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @OneToMany(() => BundleItem, b => b.bundle, { cascade: true }) items!: BundleItem[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
