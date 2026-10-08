import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from './User';
@Entity('audit_logs')
@Index(['entity','entityId'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'actor_id' }) actor?: User;
  @Column({ name: 'actor_email', length: 255, nullable: true }) actorEmail?: string;
  @Column({ name: 'actor_roles', type: 'simple-array', nullable: true }) actorRoles?: string[];
  @Column({ length: 100 }) action!: string;
  @Column({ length: 100 }) entity!: string;
  @Column({ name: 'entity_id', length: 100, nullable: true }) entityId?: string;
  @Column({ type: 'jsonb', nullable: true }) before?: Record<string,unknown>;
  @Column({ type: 'jsonb', nullable: true }) after?: Record<string,unknown>;
  @Column({ name: 'ip_address', length: 45, nullable: true }) ipAddress?: string;
  @Column({ name: 'user_agent', length: 500, nullable: true }) userAgent?: string;
  @Column({ type: 'jsonb', nullable: true }) metadata?: Record<string,unknown>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
