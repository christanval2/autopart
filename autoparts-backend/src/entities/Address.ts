import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ length: 50, nullable: true }) label?: string;
  @Column({ type: 'text' }) street!: string;
  @Column({ length: 100 }) city!: string;
  @Column({ name: 'postal_code', length: 20, nullable: true }) postalCode?: string;
  @Column({ name: 'country_code', length: 2 }) countryCode!: string;
  @Column({ name: 'is_default', default: false }) isDefault!: boolean;
}
