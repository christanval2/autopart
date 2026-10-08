import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from './Organization';
import { ProductVariant } from './ProductVariant';

/**
 * price-5 : Prix contractuels négociés entre un acheteur et un vendeur.
 * Priorité absolue sur les prix catalogue.
 */
@Entity('price_contracts')
export class PriceContract {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyer_org_id' }) buyerOrg!: Organization;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_org_id' }) sellerOrg!: Organization;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' }) variant!: ProductVariant;

  @Column({ name: 'contracted_price', type: 'decimal', precision: 12, scale: 2 }) contractedPrice!: number;
  @Column({ name: 'min_qty', default: 1 }) minQty!: number;
  @Column({ name: 'max_qty', nullable: true }) maxQty?: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ name: 'valid_from' }) validFrom!: Date;
  @Column({ name: 'valid_until' }) validUntil!: Date;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  // F5 — anti double-notification de la relance à 30 j de l'échéance
  @Column({ name: 'expiry_notified_at', nullable: true }) expiryNotifiedAt?: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
