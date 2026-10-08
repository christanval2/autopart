import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique } from 'typeorm';
import { User } from './User';
import { Product } from './Product';

@Entity('wishlists')
@Unique(['user', 'product'])
export class Wishlist {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @ManyToOne(() => Product, { onDelete: 'CASCADE', eager: false }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @Column({ type: 'text', nullable: true }) note?: string;
  // F5 — snapshot à l'ajout pour détecter baisse de prix / retour en stock
  @Column({ name: 'price_at_add', type: 'decimal', precision: 12, scale: 2, nullable: true }) priceAtAdd?: number | null;
  @Column({ name: 'was_in_stock', default: true }) wasInStock!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
