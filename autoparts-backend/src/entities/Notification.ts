import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './User';

export type NotificationType = 'order_update'|'stock_alert'|'payment'|'promo'|'system';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: ['order_update','stock_alert','payment','promo','system'],
  }) type!: NotificationType;

  @Column({ length: 200 }) title!: string;
  @Column({ type: 'text', nullable: true }) body?: string;
  @Column({ type: 'jsonb', nullable: true }) payload?: object;
  @Column({ name: 'is_read', default: false }) isRead!: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
