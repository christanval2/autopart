import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column({ length: 100 }) name!: string;
  @Column({ name: 'country_of_origin', length: 2, nullable: true }) countryOfOrigin?: string;
  @Column({ name: 'is_oem', default: false }) isOem!: boolean;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
}
