import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Warehouse } from './Warehouse';
import { User } from './User';

export type AuditStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

@Entity('stock_audits')
export class StockAudit {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Warehouse) @JoinColumn({ name: 'warehouse_id' }) warehouse!: Warehouse;
  @ManyToOne(() => User) @JoinColumn({ name: 'conducted_by' }) conductedBy!: User;
  @Column({ type: 'enum', enum: ['planned','in_progress','completed','cancelled'], default: 'planned' }) status!: AuditStatus;
  @Column({ name: 'planned_date' }) plannedDate!: Date;
  @Column({ name: 'completed_date', nullable: true }) completedDate?: Date;
  @Column({ type: 'jsonb', nullable: true }) results?: { variantId: string; sku: string; expected: number; counted: number; diff: number }[];
  @Column({ type: 'text', nullable: true }) notes?: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
