import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './User';

export type ReconMatchStatus =
  | 'matched' | 'missing_in_platform' | 'missing_at_operator' | 'amount_mismatch' | 'resolved';

@Entity('momo_statements')
export class MomoStatement {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 20, default: 'mtn' }) provider!: string;
  @Column({ name: 'period_label', length: 50 }) periodLabel!: string; // ex: '2026-08'
  @Column({ name: 'file_name', length: 255, nullable: true }) fileName?: string;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'imported_by' })
  importedBy?: User;
  @Column({ name: 'line_count', default: 0 }) lineCount!: number;
  @Column({ name: 'matched_count', default: 0 }) matchedCount!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('momo_statement_lines')
export class MomoStatementLine {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => MomoStatement, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'statement_id' })
  statement!: MomoStatement;

  @Column({ name: 'external_ref', length: 255 }) externalRef!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column({ name: 'operator_status', length: 30, nullable: true }) operatorStatus?: string;
  @Column({ name: 'occurred_at', nullable: true }) occurredAt?: Date;

  @Column({ name: 'match_status', type: 'enum', enum: ['matched','missing_in_platform','missing_at_operator','amount_mismatch','resolved'] }) matchStatus!: ReconMatchStatus;
  @Column({ name: 'matched_payment_id', nullable: true }) matchedPaymentId?: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) note?: string;
}
