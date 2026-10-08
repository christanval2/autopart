import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from './Organization';
import { Warehouse } from './Warehouse';
import { User } from './User';

export type POStatus = 'draft' | 'sent' | 'confirmed' | 'partial' | 'received' | 'cancelled';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'po_number', unique: true, length: 30 }) poNumber!: string;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'buyer_org_id' }) buyerOrg!: Organization;
  @Column({ name: 'supplier_name', length: 255 }) supplierName!: string;
  @Column({ name: 'supplier_email', nullable: true, length: 255 }) supplierEmail?: string;
  @ManyToOne(() => Warehouse) @JoinColumn({ name: 'warehouse_id' }) warehouse!: Warehouse;
  @ManyToOne(() => User) @JoinColumn({ name: 'created_by' }) createdBy!: User;
  @Column({ type: 'enum', enum: ['draft','sent','confirmed','partial','received','cancelled'], default: 'draft' }) status!: POStatus;
  @Column({ type: 'jsonb' }) lines!: { variantId: string; sku: string; quantityOrdered: number; quantityReceived: number; unitCost: number }[];
  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 }) totalAmount!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ name: 'expected_at', nullable: true }) expectedAt?: Date;
  @Column({ type: 'text', nullable: true }) notes?: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
