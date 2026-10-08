import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User }    from './User';
import { Product } from './Product';

export type ProductEventType = 'view' | 'cart' | 'purchase';

@Entity('product_events')
export class ProductEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'enum', enum: ['view','cart','purchase'] }) type!: ProductEventType;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
