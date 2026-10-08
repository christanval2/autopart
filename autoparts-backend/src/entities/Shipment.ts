import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Order }     from './Order';
import { Warehouse } from './Warehouse';

export type ShipmentStatus = 'preparing'|'in_transit'|'out_for_delivery'|'delivered'|'returned';

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Order, (o) => o.shipments, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => Warehouse, { nullable: true, eager: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse?: Warehouse;

  @Column({ name: 'tracking_number', nullable: true, length: 100 }) trackingNumber?: string;
  @Column({ nullable: true, length: 80 }) carrier?: string;

  @Column({
    type: 'enum',
    enum: ['preparing','in_transit','out_for_delivery','delivered','returned'],
    default: 'preparing',
  }) status!: ShipmentStatus;

  @Column({ name: 'shipped_at',   nullable: true }) shippedAt?:   Date;
  @Column({ name: 'delivered_at', nullable: true }) deliveredAt?: Date;
  // F3 — code de retrait Click & Collect (présenté en QR par l'acheteur)
  @Column({ name: 'pickup_code', nullable: true, length: 12 }) pickupCode?: string;
  @Column({ name: 'parcel_info',  type: 'jsonb', nullable: true }) parcelInfo?: object;
}
