import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './User';
import { Product } from './Product';

@Entity('product_qa')
export class ProductQA {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Product, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @ManyToOne(() => User) @JoinColumn({ name: 'asker_id' }) asker!: User;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'answerer_id' }) answerer?: User;
  @Column({ type: 'text' }) question!: string;
  @Column({ type: 'text', nullable: true }) answer?: string;
  @Column({ name: 'is_public', default: true }) isPublic!: boolean;
  @Column({ name: 'answered_at', nullable: true }) answeredAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
