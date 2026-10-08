import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Organization } from './Organization';

@Entity('warehouses')
export class Warehouse {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'org_id' })
  org!: Organization;

  @Column({ name: 'org_id' }) orgId!: string;

  @Column({ length: 150 }) name!: string;
  @Column({ name: 'country_code', length: 2 }) countryCode!: string;
  @Column({ length: 100 }) city!: string;
  @Column({ type: 'text', nullable: true }) address?: string;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
}
