import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Product } from './Product';
import { User } from './User';

@Entity('price_history')
export class PriceHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Product, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'changed_by' }) changedBy?: User;
  @Column({ name: 'old_price', type: 'decimal', precision: 12, scale: 2 }) oldPrice!: number;
  @Column({ name: 'new_price', type: 'decimal', precision: 12, scale: 2 }) newPrice!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ name: 'reason', length: 200, nullable: true }) reason?: string;
  @CreateDateColumn({ name: 'changed_at' }) changedAt!: Date;
}
