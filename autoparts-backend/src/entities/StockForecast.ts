import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('stock_forecasts')
@Index(['orgId', 'computedAt'])
export class StockForecast {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'variant_id' }) variantId!: string;
  @Column({ name: 'org_id' }) orgId!: string;

  @Column({ name: 'horizon_days', default: 30 }) horizonDays!: number;
  @Column({ name: 'avg_daily_sales', type: 'decimal', precision: 10, scale: 4, nullable: true }) avgDailySales?: number;
  @Column({ name: 'forecast_qty', default: 0 }) forecastQty!: number;
  @Column({ name: 'available_qty', default: 0 }) availableQty!: number;
  @Column({ name: 'reorder_point', default: 0 }) reorderPoint!: number;
  @Column({ name: 'recommended_reorder_qty', default: 0 }) recommendedReorderQty!: number;
  // Méthodologie déclarée — permettra de brancher un vrai modèle plus tard
  @Column({ length: 30, default: 'moving_average' }) method!: string;

  @CreateDateColumn({ name: 'computed_at' }) computedAt!: Date;
}
