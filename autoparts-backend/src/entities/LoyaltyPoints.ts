import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique } from 'typeorm';
import { User } from './User';
import { Order } from './Order';

export type PointsTransactionType = 'earned' | 'redeemed' | 'expired' | 'bonus' | 'adjustment';

@Entity('loyalty_points')
export class LoyaltyPoints {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'order_id' }) order?: Order;
  @Column({ type: 'enum', enum: ['earned','redeemed','expired','bonus','adjustment'] }) type!: PointsTransactionType;
  @Column({ type: 'int' }) points!: number;
  @Column({ name: 'balance_after', type: 'int' }) balanceAfter!: number;
  @Column({ name: 'description', length: 200, nullable: true }) description?: string;
  @Column({ name: 'expires_at', nullable: true }) expiresAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
