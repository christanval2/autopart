import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn,
} from 'typeorm';
import { OrgTier } from './OrgTier';

export type OrgType = 'importer'|'wholesaler'|'retailer'|'garage';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 255 }) name!: string;
  @Column({ name: 'org_type', type: 'enum', enum: ['importer','wholesaler','retailer','garage'] }) orgType!: OrgType;
  // Règles org_type : capacité de VENDRE sur la marketplace. Dérivé de
  // org_type à la création (importer/wholesaler → true) mais modifiable
  // manuellement par un admin (exception « garage activé vendeur »).
  @Column({ name: 'can_sell', default: false }) canSell!: boolean;
  @Column({ name: 'tax_id', unique: true, nullable: true, length: 50 }) taxId?: string;
  @Column({ name: 'country_code', length: 2 }) countryCode!: string;
  @Column({ name: 'parent_org_id', nullable: true }) parentOrgId?: string;
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'parent_org_id' }) parentOrg?: Organization;
  @ManyToOne(() => OrgTier, { nullable: true, eager: true })
  @JoinColumn({ name: 'tier_id' })
  tier?: OrgTier;
  @Column({ name: 'is_verified', default: false }) isVerified!: boolean;
  @Column({ name: 'credit_limit', type: 'decimal', precision: 15, scale: 2, default: 0 }) creditLimit!: number;
  // F4 — score de performance vendeur 0-100, recalculé quotidiennement
  @Column({ name: 'performance_score', type: 'decimal', precision: 5, scale: 2, nullable: true }) performanceScore?: number | null;
  @Column({ name: 'performance_computed_at', type: 'timestamp', nullable: true }) performanceComputedAt?: Date | null;
  // Montant (XAF) au-delà duquel une commande B2B exige une approbation manager.
  // NULL = pas d'approbation requise.
  @Column({ name: 'approval_threshold', type: 'decimal', precision: 15, scale: 2, nullable: true }) approvalThreshold?: number | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
