import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Product } from './Product';

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Index({ unique: true })
  @Column({ name: 'variant_sku', length: 120 }) variantSku!: string;

  @Column({ type: 'jsonb', default: '{}' }) attributes!: Record<string, string>;

  @Column({ name: 'price_override', type: 'decimal', precision: 12, scale: 2, nullable: true })
  priceOverride?: number;

  @Column({ name: 'cost_price', type: 'decimal', precision: 12, scale: 2 }) costPrice!: number;
  @Column({ name: 'reorder_point', default: 5 }) reorderPoint!: number;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
}
