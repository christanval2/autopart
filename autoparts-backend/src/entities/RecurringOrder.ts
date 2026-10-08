import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User';
import { Organization } from './Organization';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

@Entity('recurring_orders')
export class RecurringOrder {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'buyer_id' }) buyer!: User;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'seller_org_id' }) sellerOrg!: Organization;
  @Column({ length: 150 }) name!: string;
  @Column({ type: 'enum', enum: ['daily','weekly','biweekly','monthly'] }) frequency!: RecurrenceFrequency;
  @Column({ type: 'jsonb' }) template!: object;
  @Column({ name: 'next_run_at' }) nextRunAt!: Date;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @Column({ name: 'billing_address_id', nullable: true }) billingAddressId?: string;
  @Column({ name: 'shipping_address_id', nullable: true }) shippingAddressId?: string;
  @Column({ name: 'runs_count', default: 0 }) runsCount!: number;
  @Column({ name: 'last_run_at', nullable: true }) lastRunAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
