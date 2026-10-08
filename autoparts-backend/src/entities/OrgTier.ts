import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('org_tiers')
export class OrgTier {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 50 }) name!: string;
  @Column({ name: 'discount_rate', type: 'decimal', precision: 5, scale: 2 }) discountRate!: number;
  @Column({ name: 'min_order_qty', default: 1 }) minOrderQty!: number;
  @Column({ name: 'min_order_value', type: 'decimal', precision: 12, scale: 2, default: 0 }) minOrderValue!: number;
  @Column({ name: 'can_buy_wholesale', default: false }) canBuyWholesale!: boolean;
  @Column({ name: 'can_sell', default: false }) canSell!: boolean;
}
