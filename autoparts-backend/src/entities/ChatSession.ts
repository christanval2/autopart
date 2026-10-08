import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User';
export interface ChatMessage { role: 'user'|'assistant'|'system'; content: string; ts: number; }
@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true }) @JoinColumn({ name: 'user_id' }) user?: User;
  @Column({ name: 'session_key', length: 100, unique: true }) sessionKey!: string;
  @Column({ type: 'jsonb', default: '[]' }) messages!: ChatMessage[];
  @Column({ type: 'jsonb', nullable: true }) context?: Record<string,unknown>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
