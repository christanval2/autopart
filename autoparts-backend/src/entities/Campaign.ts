import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 200 }) subject!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ length: 20, default: 'all' }) audience!: string;
  @Column({ length: 20, default: 'sent' }) status!: string;
  @Column({ name: 'sent_at', nullable: true }) sentAt?: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('campaign_recipients')
export class CampaignRecipient {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ length: 255 }) email!: string;
  // Token unique par destinataire : pixel d'ouverture, clic, désinscription
  @Column({ length: 64, unique: true }) token!: string;
  @Column({ name: 'opened_at', nullable: true }) openedAt?: Date;
  @Column({ name: 'clicked_at', nullable: true }) clickedAt?: Date;
  @Column({ name: 'unsubscribed_at', nullable: true }) unsubscribedAt?: Date;
}
