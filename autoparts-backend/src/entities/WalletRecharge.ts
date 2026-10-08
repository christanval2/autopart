import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './User';

export type WalletRechargeStatus = 'pending' | 'completed' | 'failed';

@Entity('wallet_recharges')
export class WalletRecharge {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ type: 'enum', enum: ['mtn','orange'] }) provider!: 'mtn'|'orange';
  @Column({ length: 20 }) phone!: string;
  @Column({ name: 'gateway_ref', unique: true, length: 255 }) gatewayRef!: string;
  @Column({ type: 'enum', enum: ['pending','completed','failed'], default: 'pending' }) status!: WalletRechargeStatus;
  @Column({ name: 'processed_at', nullable: true }) processedAt?: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
