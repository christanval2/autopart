import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User }    from './User';
import { Product } from './Product';
import { Order }   from './Order';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer!: User;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ type: 'int', default: 5 }) rating!: number;
  @Column({ type: 'text', nullable: true }) comment?: string;
  @Column({ name: 'is_verified_purchase', default: false }) isVerifiedPurchase!: boolean;

  // Modération a posteriori : visible par défaut, rejet masque l'avis
  @Column({ type: 'enum', enum: ['approved','pending','rejected'], default: 'approved' }) status!: 'approved'|'pending'|'rejected';
  @Column({ name: 'rejection_reason', nullable: true, length: 300 }) rejectionReason?: string;
  @Column({ name: 'seller_reply', type: 'text', nullable: true }) sellerReply?: string;
  @Column({ name: 'seller_replied_at', nullable: true }) sellerRepliedAt?: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
