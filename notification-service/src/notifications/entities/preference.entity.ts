import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

// Sección 5.8 del documento de arquitectura.
@Entity("preferences")
@Unique(["user_id", "channel"])
export class Preference {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Índice compuesto (user_id, channel) que pide el documento -- se logra
  // con el mismo UNIQUE de arriba (todo UNIQUE ya crea su índice).
  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @Column()
  channel: string; // 'email' | 'in_app'

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  created_at: Date;
}
