import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, Index, JoinColumn,
} from 'typeorm';
import { Category }             from './Category';
import { Brand }                from './Brand';
import { ProductVariant }       from './ProductVariant';
import { ProductImage }         from './ProductImage';
import { ProductCompatibility } from './ProductCompatibility';
import { Organization }         from './Organization';

export type ProductCondition = 'new' | 'genuine_used' | 'reconditioned';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Index({ unique: true })
  @Column({ length: 100 }) sku!: string;

  @Index()
  @Column({ name: 'oem_reference', nullable: true, length: 100 }) oemReference?: string;

  @Column({ length: 255 }) name!: string;
  @Column({ type: 'text', nullable: true }) description?: string;

  @Column({ name: 'category_id' }) categoryId!: string;
  @ManyToOne(() => Category, { eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column({ name: 'brand_id' }) brandId!: string;
  @ManyToOne(() => Brand, { eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'brand_id' })
  brand!: Brand;

  @Column({ name: 'base_price', type: 'decimal', precision: 12, scale: 2 }) basePrice!: number;
  @Column({ length: 3, default: 'XAF' }) currency!: string;
  @Column({ name: 'weight_kg', type: 'float', nullable: true }) weightKg?: number;
  @Column({ name: 'dimensions_cm', type: 'jsonb', nullable: true }) dimensionsCm?: { length: number; width: number; height: number };

  @Column({
    type: 'enum',
    enum: ['new', 'genuine_used', 'reconditioned'],
    default: 'new',
  }) condition!: ProductCondition;

  @Column({ name: 'is_active', default: true }) isActive!: boolean;

  // R1 — organisation propriétaire (vendeur). NULL = produit plateforme (admin).
  @Column({ name: 'org_id', type: 'uuid', nullable: true }) orgId?: string | null;
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'org_id' })
  org?: Organization | null;

  // Règles org_type — MOQ : quantité minimale de commande. NULL = pas de
  // MOQ. Défaut selon org_type du vendeur à la création (importer 50 =
  // palette, wholesaler 5 = carton, garage/retailer 1), modifiable
  // produit par produit ensuite.
  @Column({ name: 'min_order_qty', type: 'integer', nullable: true }) minOrderQty?: number | null;

  // Règles org_type — visibilité catalogue public : seuls les produits
  // marqués public_listing (et vendus par un org non-importateur)
  // apparaissent sur /catalogue sans authentification, au tier « détail ».
  @Column({ name: 'public_listing', default: false }) publicListing!: boolean;

  @OneToMany(() => ProductVariant, (v) => v.product, { cascade: true })
  variants!: ProductVariant[];

  @OneToMany(() => ProductImage, (i) => i.product, { cascade: true })
  images!: ProductImage[];

  @OneToMany(() => ProductCompatibility, (c) => c.product, { cascade: true })
  compatibilities!: ProductCompatibility[];

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
