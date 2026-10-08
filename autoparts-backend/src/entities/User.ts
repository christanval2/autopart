import { Exclude } from 'class-transformer';
import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn,
} from 'typeorm';
import { Organization } from './Organization';

export type UserRole = 'super_admin'|'org_admin'|'seller'|'buyer'|'logistics'|'accountant';
export type AccountType = 'individual'|'pro'|'admin';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true, length: 255 }) email!: string;
  // F1 — téléphone chiffré AES-256-GCM en base ; phone_hash (SHA-256) sert
  // aux recherches/existences. Jamais exposés : l'API renvoie `phone` déchiffré.
  @Exclude()
  @Column({ name: 'phone_enc', type: 'text', nullable: true }) phoneEnc?: string | null;
  @Exclude()
  @Column({ name: 'phone_hash', type: 'varchar', length: 64, nullable: true }) phoneHash?: string | null;
  @Exclude()
  @Column({ name: 'password_hash', length: 255 }) passwordHash!: string;
  @Column({ name: 'first_name', length: 100 }) firstName!: string;
  @Column({ name: 'last_name', length: 100 }) lastName!: string;
  @Column({ name: 'org_id', nullable: true }) orgId?: string;
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'org_id' }) org?: Organization;
  @Column({ name: 'account_type', type: 'enum', enum: ['individual','pro','admin'], default: 'individual' }) accountType!: AccountType;
  @Column({ type: 'simple-array', default: 'buyer' }) roles!: UserRole[];
  @Column({ name: 'is_verified', default: false }) isVerified!: boolean;
  // R4 — désactivation (préféreble à la suppression) + mot de passe temporaire
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @Column({ name: 'must_change_password', default: false }) mustChangePassword!: boolean;
  @Column({ name: 'expo_push_token', type: 'varchar', nullable: true, length: 255 }) expoPushToken?: string | null;
  // F5 — opt-outs (l'OTP de sécurité contourne toujours l'opt-out SMS)
  @Column({ name: 'sms_opt_out', default: false }) smsOptOut!: boolean;
  @Column({ name: 'marketing_opt_out', default: false }) marketingOptOut!: boolean;
  @Column({ name: 'last_login_at', nullable: true }) lastLoginAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
