import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { User } from './User';
import { Order } from './Order';

@Entity('wallets')
@Unique(['user'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 }) balance!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
