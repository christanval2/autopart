import {
  Entity, PrimaryGeneratedColumn, Column,
  OneToOne, OneToMany, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User }          from './User';
import { ProductVariant } from './ProductVariant';

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @OneToMany(() => CartItem, (i) => i.cart)
  items!: CartItem[];

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Cart, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart!: Cart;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @Column({ type: 'int' }) quantity!: number;
  // Prix au moment de l'ajout — permet d'alerter si le prix a changé
  @Column({ name: 'price_at_add', type: 'decimal', precision: 12, scale: 2 }) priceAtAdd!: number;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
