import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Organization } from './Organization';

@Entity('catalogs')
export class Catalog {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'org_id' })
  org!: Organization;

  @Column({ name: 'org_id' }) orgId!: string;

  @Column({ length: 150 }) name!: string;

  @Column({
    type: 'enum',
    enum: ['public', 'private', 'b2b_only'],
    default: 'b2b_only',
  }) visibility!: 'public' | 'private' | 'b2b_only';

  @Column({ name: 'markup_pct', type: 'decimal', precision: 5, scale: 2, default: 0 })
  markupPct!: number;

  @Column({ name: 'valid_from', type: 'date', nullable: true }) validFrom?: Date;
  @Column({ name: 'valid_until', type: 'date', nullable: true }) validUntil?: Date;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
