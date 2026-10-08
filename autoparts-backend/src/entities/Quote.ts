import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User';
import { Organization } from './Organization';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'quote_number', unique: true, length: 30 }) quoteNumber!: string;

  @ManyToOne(() => User) @JoinColumn({ name: 'buyer_id' }) buyer!: User;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'seller_org_id' }) sellerOrg!: Organization;

  @Column({ type: 'enum', enum: ['draft','sent','accepted','rejected','expired','converted'], default: 'draft' })
  status!: QuoteStatus;

  @Column({ name: 'valid_until', type: 'date' }) validUntil!: Date;
  @Column({ name: 'subtotal', type: 'decimal', precision: 12, scale: 2 }) subtotal!: number;
  @Column({ name: 'discount_pct', type: 'decimal', precision: 5, scale: 2, default: 0 }) discountPct!: number;
  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 }) totalAmount!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ type: 'text', nullable: true }) notes?: string;
  @Column({ type: 'jsonb', nullable: true }) lines?: object;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
