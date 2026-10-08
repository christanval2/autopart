import {
  Entity, PrimaryGeneratedColumn, Column,
  Index, CreateDateColumn,
} from 'typeorm';

export type StockMovementReason =
  | 'purchase' | 'sale' | 'return' | 'damage' | 'correction'
  | 'transfer_in' | 'transfer_out' | 'reservation' | 'release';

@Entity('stock_movements')
@Index(['variantId', 'createdAt'])
@Index(['warehouseId'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'variant_id' }) variantId!: string;
  // Nullable : réservation/libération sont tracking au niveau variante
  // quand l'entrepôt concerné n'est pas déterminé par la logique métier
  @Column({ name: 'warehouse_id', nullable: true }) warehouseId?: string;

  @Column({ type: 'enum', enum: ['purchase','sale','return','damage','correction','transfer_in','transfer_out','reservation','release'] }) reason!: StockMovementReason;

  @Column({ name: 'qty_delta', type: 'int' }) qtyDelta!: number;
  @Column({ name: 'qty_before', type: 'int', nullable: true }) qtyBefore?: number | null;
  @Column({ name: 'qty_after',  type: 'int', nullable: true }) qtyAfter?: number | null;

  @Column({ name: 'user_id', nullable: true }) userId?: string;
  @Column({ name: 'order_id', nullable: true }) orderId?: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) note?: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
