import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Organization } from './Organization';
import { User }         from './User';

export type OrgDocType   = 'rccm' | 'patente' | 'statuts' | 'id_card';
export type OrgDocStatus = 'pending' | 'approved' | 'rejected';

@Entity('org_documents')
export class OrgDocument {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'org_id' })
  org!: Organization;

  @Column({ type: 'enum', enum: ['rccm','patente','statuts','id_card'] }) type!: OrgDocType;
  @Column({ name: 'file_url', length: 500 }) fileUrl!: string;
  @Column({ name: 'original_name', length: 255, nullable: true }) originalName?: string;
  @Column({ name: 'uploaded_by', nullable: true }) uploadedBy?: string;

  @Column({ type: 'enum', enum: ['pending','approved','rejected'], default: 'pending' }) status!: OrgDocStatus;
  @Column({ name: 'reviewed_by', nullable: true }) reviewedBy?: string;
  @Column({ name: 'reviewed_at', nullable: true }) reviewedAt?: Date;
  @Column({ name: 'rejection_reason', nullable: true, length: 300 }) rejectionReason?: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
