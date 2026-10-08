import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, UpdateDateColumn, Unique } from 'typeorm';
import { Organization } from './Organization';

@Entity('seller_locations')
@Unique(['org'])
export class SellerLocation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'org_id' }) org!: Organization;
  @Column({ type: 'decimal', precision: 10, scale: 8 }) latitude!: number;
  @Column({ type: 'decimal', precision: 11, scale: 8 }) longitude!: number;
  @Column({ length: 255, nullable: true }) address?: string;
  @Column({ length: 100, nullable: true }) city?: string;
  @Column({ name: 'is_visible', default: true }) isVisible!: boolean;
  @Column({ type: 'simple-array', nullable: true }) categories?: string[];
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
