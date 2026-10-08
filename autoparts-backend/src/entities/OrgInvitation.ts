import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Organization } from './Organization';
import type { UserRole } from './User';

@Entity('org_invitations')
export class OrgInvitation {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'org_id' })
  org!: Organization;

  @Column({ length: 255 }) email!: string;
  @Column({ type: 'enum', enum: ['org_admin','seller','buyer','logistics','accountant'] }) role!: Exclude<UserRole, 'super_admin'>;
  @Column({ length: 100 }) token!: string;
  @Column({ type: 'enum', enum: ['pending','accepted','expired','revoked'], default: 'pending' }) status!: 'pending'|'accepted'|'expired'|'revoked';
  @Column({ name: 'expires_at' }) expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
