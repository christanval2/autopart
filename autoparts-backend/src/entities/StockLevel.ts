import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  UpdateDateColumn, Unique, AfterLoad,
} from 'typeorm';
import { Warehouse }      from './Warehouse';
import { ProductVariant } from './ProductVariant';

@Entity('stock_levels')
@Unique(['warehouse', 'variant'])
export class StockLevel {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @Column({ name: 'qty_on_hand', default: 0 }) qtyOnHand!: number;
  @Column({ name: 'qty_reserved', default: 0 }) qtyReserved!: number;

  // Colonne virtuelle calculée après chargement
  qtyAvailable!: number;

  @AfterLoad()
  computeAvailable() {
    this.qtyAvailable = this.qtyOnHand - this.qtyReserved;
  }

  @UpdateDateColumn({ name: 'last_updated_at' }) lastUpdatedAt!: Date;
}
