import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './User';

@Entity('search_history')
export class SearchHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true }) @JoinColumn({ name: 'user_id' }) user?: User;
  @Column({ name: 'session_id', nullable: true, length: 100 }) sessionId?: string;
  @Column({ length: 300 }) query!: string;
  @Column({ name: 'results_count', default: 0 }) resultsCount!: number;
  @Column({ name: 'search_type', length: 30, default: 'text' }) searchType!: string;
  @Column({ type: 'jsonb', nullable: true }) filters?: object;
  @CreateDateColumn({ name: 'searched_at' }) searchedAt!: Date;
}
