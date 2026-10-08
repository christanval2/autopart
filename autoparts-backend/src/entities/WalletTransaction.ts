import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Wallet } from './Wallet';
import { Order } from './Order';

export type WalletTxType = 'credit' | 'debit' | 'refund' | 'adjustment';

@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Wallet) @JoinColumn({ name: 'wallet_id' }) wallet!: Wallet;
  @ManyToOne(() => Order, { nullable: true }) @JoinColumn({ name: 'order_id' }) order?: Order;
  @Column({ type: 'enum', enum: ['credit','debit','refund','adjustment'] }) type!: WalletTxType;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ name: 'balance_after', type: 'decimal', precision: 15, scale: 2 }) balanceAfter!: number;
  @Column({ name: 'description', length: 200, nullable: true }) description?: string;
  @Column({ name: 'reference', length: 100, nullable: true }) reference?: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
