import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './User';

@Entity('two_factor_auth')
export class TwoFactorAuth {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id' }) userId!: string;
  @Column({ name: 'secret', length: 100 }) secret!: string;
  @Column({ name: 'is_enabled', default: false }) isEnabled!: boolean;
  @Column({ name: 'backup_codes', type: 'simple-array', nullable: true }) backupCodes?: string[];

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
