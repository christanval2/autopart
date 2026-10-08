import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Payment } from './Payment';
import { User }  from './User';

export type RefundMethod  = 'momo' | 'bank_transfer' | 'wallet';
export type RefundStatus  = 'pending' | 'processing' | 'completed' | 'failed' | 'pending_manual';

@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'processed_by' })
  processedBy?: User;

  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ type: 'enum', enum: ['momo','bank_transfer','wallet'] }) method!: RefundMethod;
  @Column({ type: 'enum', enum: ['pending','processing','completed','failed','pending_manual'], default: 'pending' }) status!: RefundStatus;
  @Column({ length: 500 }) reason!: string;
  @Column({ name: 'gateway_ref', nullable: true, length: 255 }) gatewayRef?: string;
  // Preuve de virement / avis de crédit pour les remboursements manuels
  @Column({ nullable: true, length: 500 }) proof?: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
