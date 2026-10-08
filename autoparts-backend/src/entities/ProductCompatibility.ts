import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn } from 'typeorm';
import { Product } from './Product';

@Entity('product_compatibilities')
export class ProductCompatibility {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Product, (p) => p.compatibilities, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Index()
  @Column({ length: 80 }) make!: string;

  @Index()
  @Column({ length: 80 }) model!: string;

  @Column({ name: 'year_from' }) yearFrom!: number;
  @Column({ name: 'year_to', nullable: true }) yearTo?: number;
  @Column({ name: 'engine_code', nullable: true, length: 50 }) engineCode?: string;
}
