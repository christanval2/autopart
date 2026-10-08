import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from './Organization';
import { Category } from './Category';

export type PromoType = 'percentage' | 'fixed' | 'free_shipping' | 'bogo';
export type PromoScope = 'all' | 'category' | 'product' | 'org';

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ unique: true, length: 50 }) code!: string;
  @Column({ length: 200 }) name!: string;
  @Column({ type: 'enum', enum: ['percentage','fixed','free_shipping','bogo'] }) type!: PromoType;
  @Column({ type: 'enum', enum: ['all','category','product','org'], default: 'all' }) scope!: PromoScope;
  @Column({ name: 'discount_value', type: 'decimal', precision: 10, scale: 2 }) discountValue!: number;
  @Column({ name: 'min_order_amount', type: 'decimal', precision: 12, scale: 2, default: 0 }) minOrderAmount!: number;
  @Column({ name: 'max_uses', nullable: true }) maxUses?: number;
  @Column({ name: 'uses_count', default: 0 }) usesCount!: number;
  @Column({ name: 'max_uses_per_user', default: 1 }) maxUsesPerUser!: number;
  @Column({ name: 'valid_from' }) validFrom!: Date;
  @Column({ name: 'valid_until' }) validUntil!: Date;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @Column({ name: 'scope_id', nullable: true }) scopeId?: string;
  /** Organisation propriétaire — chaque vendeur gère SES promotions. */
  @Column({ name: 'org_id', type: 'varchar', nullable: true }) orgId?: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
