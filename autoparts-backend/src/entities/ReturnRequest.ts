import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Order } from './Order';
import { OrderLine } from './OrderLine';
import { User } from './User';

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'shipped_back' | 'received' | 'refunded';
export type ReturnReason = 'defective' | 'wrong_item' | 'not_as_described' | 'changed_mind' | 'damaged_shipping' | 'other';

@Entity('return_requests')
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Order) @JoinColumn({ name: 'order_id' }) order!: Order;
  @ManyToOne(() => User) @JoinColumn({ name: 'requester_id' }) requester!: User;
  @Column({ type: 'enum', enum: ['requested','approved','rejected','shipped_back','received','refunded'], default: 'requested' }) status!: ReturnStatus;
  @Column({ type: 'enum', enum: ['defective','wrong_item','not_as_described','changed_mind','damaged_shipping','other'] }) reason!: ReturnReason;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Column({ type: 'jsonb', nullable: true }) lines?: { variantId: string; quantity: number }[];
  @Column({ name: 'return_tracking', nullable: true, length: 100 }) returnTracking?: string;
  @Column({ name: 'refund_amount', type: 'decimal', precision: 12, scale: 2, nullable: true }) refundAmount?: number;
  @Column({ name: 'resolved_by', nullable: true }) resolvedById?: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
