import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('tax_configs')
export class TaxConfig {
  @PrimaryGeneratedColumn('uuid') id!: string;

  // Pays/région — ex: 'CM' (Cameroun). Unique : une ligne par pays.
  @Column({ name: 'country_code', length: 2 }) countryCode!: string;
  // Taux en décimal : 0.1925 = 19,25 %
  @Column({ name: 'rate', type: 'decimal', precision: 5, scale: 4 }) rate!: number;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  // Catégories B2B exemptées (ids de catégories) — vide = aucune exemption
  @Column({ name: 'exempted_category_ids', type: 'jsonb', default: '[]' }) exemptedCategoryIds!: string[];

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
