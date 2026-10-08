import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, OneToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { User }         from './User';
import { Organization } from './Organization';
import { Address }      from './Address';
import { OrderLine }    from './OrderLine';
import { Payment }      from './Payment';
import { Shipment }     from './Shipment';

export type OrderStatus  = 'draft'|'confirmed'|'processing'|'shipped'|'delivered'|'cancelled'|'refunded';
export type OrderChannel = 'b2b'|'b2c'|'marketplace';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Index({ unique: true })
  @Column({ name: 'order_number', length: 30 }) orderNumber!: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'buyer_id' })
  buyer!: User;

  @ManyToOne(() => Organization, { eager: false })
  @JoinColumn({ name: 'seller_org_id' })
  sellerOrg!: Organization;

  @Column({ type: 'enum', enum: ['b2b','b2c','marketplace'] }) channel!: OrderChannel;

  @Column({
    type: 'enum',
    enum: ['draft','confirmed','processing','shipped','delivered','cancelled','refunded'],
    default: 'draft',
  }) status!: OrderStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 }) subtotal!: number;
  @Column({ name: 'tax_amount',      type: 'decimal', precision: 12, scale: 2, default: 0 }) taxAmount!: number;
  @Column({ name: 'shipping_cost',   type: 'decimal', precision: 12, scale: 2, default: 0 }) shippingCost!: number;
  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 }) discountAmount!: number;
  @Column({ name: 'total_amount',    type: 'decimal', precision: 12, scale: 2 }) totalAmount!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;

  @ManyToOne(() => Address, { nullable: true, eager: false })
  @JoinColumn({ name: 'billing_address_id' })
  billingAddress?: Address;

  @ManyToOne(() => Address, { nullable: true, eager: false })
  @JoinColumn({ name: 'shipping_address_id' })
  shippingAddress?: Address;

  @Column({ type: 'text', nullable: true }) notes?: string;

  @OneToMany(() => OrderLine, (l) => l.order, { cascade: true })
  lines!: OrderLine[];

  @OneToOne(() => Payment, (p) => p.order, { eager: false })
  payment?: Payment;

  @OneToMany(() => Shipment, (s) => s.order, { eager: false })
  shipments!: Shipment[];

  @CreateDateColumn({ name: 'ordered_at' }) orderedAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
