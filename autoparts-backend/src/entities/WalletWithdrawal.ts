import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './User';

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'failed';

@Entity('wallet_withdrawals')
export class WalletWithdrawal {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'processed_by' })
  processedBy?: User;

  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ length: 20 }) phone!: string;
  @Column({ type: 'enum', enum: ['pending','approved','rejected','paid','failed'], default: 'pending' }) status!: WithdrawalStatus;
  @Column({ name: 'rejection_reason', nullable: true, length: 300 }) rejectionReason?: string;
  @Column({ name: 'gateway_ref', nullable: true, length: 255 }) gatewayRef?: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
