import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

   @Column({ length: 500 }) url!: string;
  // Variantes générées : { thumb: '...150w', medium: '...600w', large: '...1200w' }
  @Column({ type: 'jsonb', nullable: true }) sizes?: { thumb?: string; medium?: string; large?: string };
  @Column({ name: 'alt_text', nullable: true, length: 200 }) altText?: string;
   @Column({ name: 'is_primary', default: false }) isPrimary!: boolean;
   @Column({ name: 'sort_order', default: 0 }) sortOrder!: number;
}
