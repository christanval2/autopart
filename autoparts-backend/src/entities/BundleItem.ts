import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Bundle } from './Bundle';
import { ProductVariant } from './ProductVariant';

@Entity('bundle_items')
export class BundleItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Bundle, b => b.items, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'bundle_id' }) bundle!: Bundle;
  @ManyToOne(() => ProductVariant, { eager: false }) @JoinColumn({ name: 'variant_id' }) variant!: ProductVariant;
  @Column({ default: 1 }) quantity!: number;
}
