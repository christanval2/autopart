import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Order } from './Order';
import { User } from './User';

export type DisputeStatus = 'open' | 'under_review' | 'resolved_buyer' | 'resolved_seller' | 'closed';
export type DisputeType = 'not_received' | 'wrong_item' | 'quality' | 'payment' | 'other';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Order) @JoinColumn({ name: 'order_id' }) order!: Order;
  @ManyToOne(() => User) @JoinColumn({ name: 'claimant_id' }) claimant!: User;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'assigned_to' }) assignedTo?: User;
  @Column({ type: 'enum', enum: ['open','under_review','resolved_buyer','resolved_seller','closed'], default: 'open' }) status!: DisputeStatus;
  @Column({ type: 'enum', enum: ['not_received','wrong_item','quality','payment','other'] }) type!: DisputeType;
  @Column({ type: 'text' }) description!: string;
  @Column({ name: 'resolution_notes', type: 'text', nullable: true }) resolutionNotes?: string;
  @Column({ name: 'evidence_urls', type: 'simple-array', nullable: true }) evidenceUrls?: string[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
