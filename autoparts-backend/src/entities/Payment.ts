import {
  Entity, PrimaryGeneratedColumn, Column,
  OneToOne, JoinColumn,
} from 'typeorm';
import { Order } from './Order';

export type PaymentMethod = 'mobile_money'|'bank_transfer'|'cash'|'credit'|'card';
export type PaymentStatus = 'pending'|'processing'|'completed'|'failed'|'refunded';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @OneToOne(() => Order, (o) => o.payment, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'enum', enum: ['mobile_money','bank_transfer','cash','credit','card'] })
  method!: PaymentMethod;

  @Column({
    type: 'enum',
    enum: ['pending','processing','completed','failed','refunded'],
    default: 'pending',
  }) status!: PaymentStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ length: 3 }) currency!: string;
  @Column({ name: 'gateway_ref', length: 255 }) gatewayRef!: string;
  @Column({ name: 'gateway_response', type: 'jsonb', nullable: true }) gatewayResponse?: unknown;
  @Column({ name: 'paid_at', nullable: true }) paidAt?: Date;
}
