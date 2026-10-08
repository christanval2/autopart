import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './User';
import { Order } from './Order';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'sender_id' }) sender!: User;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'recipient_id' }) recipient!: User;
  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'order_id' }) order?: Order;
  @Column({ name: 'subject', length: 200, nullable: true }) subject?: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ name: 'is_read', default: false }) isRead!: boolean;
  @Column({ name: 'attachments', type: 'simple-array', nullable: true }) attachments?: string[];
  // F5 — relance automatique envoyée au destinataire après 24 h sans réponse
  @Column({ name: 'reminder_sent_at', nullable: true }) reminderSentAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
