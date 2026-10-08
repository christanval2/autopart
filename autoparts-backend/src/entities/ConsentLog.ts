import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('consent_logs')
export class ConsentLog {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // ex: 'cgv', 'cookies', 'marketing_email'
  @Column({ length: 50 }) type!: string;
  @Column({ length: 20 }) version!: string;
  @Column({ default: true }) accepted!: boolean;
  @Column({ nullable: true, length: 64 }) ip?: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
