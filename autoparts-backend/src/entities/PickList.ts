import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Order } from './Order';
import { Warehouse } from './Warehouse';
import { User } from './User';

export type PickListStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

@Entity('pick_lists')
export class PickList {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Order) @JoinColumn({ name: 'order_id' }) order!: Order;
  @ManyToOne(() => Warehouse) @JoinColumn({ name: 'warehouse_id' }) warehouse!: Warehouse;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'picker_id' }) picker?: User;
  @Column({ type: 'enum', enum: ['pending','in_progress','completed','cancelled'], default: 'pending' }) status!: PickListStatus;
  @Column({ type: 'jsonb' }) items!: { variantId: string; sku: string; qty: number; location?: string; pickedAt?: string }[];
  @Column({ name: 'started_at', nullable: true }) startedAt?: Date;
  @Column({ name: 'completed_at', nullable: true }) completedAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
