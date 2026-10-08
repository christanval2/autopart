import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Organization } from './Organization';

export type ShippingZoneType = 'city' | 'national' | 'international';

@Entity('shipping_zones')
export class ShippingZone {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'org_id' })
  org!: Organization;

  @Column({ length: 100 }) name!: string; // ex: 'Douala', 'Yaoundé', 'Intérieur', 'International'
  @Column({ name: 'zone_type', type: 'enum', enum: ['city','national','international'] }) zoneType!: ShippingZoneType;

  // Tarif fixe (si weightKg inconnu) ; sinon tarif/kg s'ajoute au fixe
  @Column({ name: 'flat_rate', type: 'decimal', precision: 12, scale: 2, default: 0 }) flatRate!: number;
  @Column({ name: 'rate_per_kg', type: 'decimal', precision: 12, scale: 2, default: 0 }) ratePerKg!: number;

  // Livraison gratuite si total commande >= seuil
  @Column({ name: 'free_threshold', type: 'decimal', precision: 12, scale: 2, nullable: true }) freeThreshold?: number | null;

  @Column({ name: 'estimated_days', type: 'int', nullable: true }) estimatedDays?: number | null;

  // Zone premium Express
  @Column({ name: 'is_express', default: false }) isExpress!: boolean;
  @Column({ name: 'express_surcharge_pct', type: 'decimal', precision: 5, scale: 2, default: 0 }) expressSurchargePct!: number;

  @Column({ name: 'is_active', default: true }) isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
