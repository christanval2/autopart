import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Order }          from './Order';
import { ProductVariant } from './ProductVariant';

@Entity('order_lines')
export class OrderLine {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Order, (o) => o.lines, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => ProductVariant, { eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @Column({ name: 'product_snapshot', type: 'jsonb' }) productSnapshot!: Record<string, unknown>;
  @Column({ type: 'int' }) quantity!: number;
  @Column({ name: 'unit_price',  type: 'decimal', precision: 12, scale: 2 }) unitPrice!: number;
  @Column({ name: 'line_total',  type: 'decimal', precision: 12, scale: 2 }) lineTotal!: number;
  @Column({ name: 'tax_rate',    type: 'decimal', precision: 5,  scale: 2, default: 0 }) taxRate!: number;
}
