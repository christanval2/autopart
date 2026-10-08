import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Order } from './Order';
import { User } from './User';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

@Entity('order_approvals')
export class OrderApproval {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Order, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'order_id' }) order!: Order;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'approver_id' }) approver?: User;
  @Column({ type: 'enum', enum: ['pending','approved','rejected'], default: 'pending' }) status!: ApprovalStatus;
  @Column({ type: 'text', nullable: true }) reason?: string;
  @Column({ name: 'threshold_amount', type: 'decimal', precision: 12, scale: 2 }) thresholdAmount!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @Column({ name: 'decided_at', nullable: true }) decidedAt?: Date;
}
