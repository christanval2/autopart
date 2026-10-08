import { Entity, Column, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm';
import { Catalog }        from './Catalog';
import { ProductVariant } from './ProductVariant';

@Entity('catalog_products')
export class CatalogProduct {
  @PrimaryColumn({ name: 'catalog_id' }) catalogId!: string;
  @PrimaryColumn({ name: 'variant_id' }) variantId!: string;

  @ManyToOne(() => Catalog, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'catalog_id' })
  catalog!: Catalog;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @Column({ name: 'custom_price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  customPrice?: number;

  @Column({ name: 'min_qty', default: 1 }) minQty!: number;
  @Column({ name: 'max_qty', nullable: true }) maxQty?: number;
  @Column({ name: 'is_available', default: true }) isAvailable!: boolean;
}
