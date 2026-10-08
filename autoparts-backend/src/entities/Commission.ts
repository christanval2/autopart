import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Order } from './Order';
import { Organization } from './Organization';

export type CommissionStatus = 'pending' | 'validated' | 'paid' | 'cancelled';

@Entity('commissions')
export class Commission {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Order) @JoinColumn({ name: 'order_id' }) order!: Order;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'seller_org_id' }) sellerOrg!: Organization;
  @Column({ name: 'rate_pct', type: 'decimal', precision: 5, scale: 2 }) ratePct!: number;
  @Column({ name: 'base_amount', type: 'decimal', precision: 12, scale: 2 }) baseAmount!: number;
  @Column({ name: 'commission_amount', type: 'decimal', precision: 12, scale: 2 }) commissionAmount!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ type: 'enum', enum: ['pending','validated','paid','cancelled'], default: 'pending' }) status!: CommissionStatus;
  @Column({ name: 'paid_at', nullable: true }) paidAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
