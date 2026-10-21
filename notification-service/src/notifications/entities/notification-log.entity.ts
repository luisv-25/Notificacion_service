import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export enum NotificationStatus {
  QUEUED = "queued",
  SENT = "sent",
  FAILED = "failed",
}

// Sección 5.8 del documento de arquitectura.
@Entity("notification_log")
@Check(`"status" IN ('queued','sent','failed')`)
export class NotificationLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Referencia LÓGICA a user_db.users.id (sección 5.10: desacoplado por
  // diseño, nunca FK física cruzando bases).
  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @Column()
  channel: string; // 'email' | 'in_app'

  @Column()
  template: string; // 'booking_confirmation' | 'class_reminder' | 'package_low_balance'

  @Column({ type: "enum", enum: NotificationStatus, default: NotificationStatus.QUEUED })
  status: NotificationStatus;

  @Column({ type: "timestamptz", nullable: true })
  sent_at: Date | null;

  // Adición práctica (no está en la tabla del documento, que solo lista
  // las columnas "relevantes"): identifica de forma estable el hecho que
  // originó el envío (p. ej. "class_reminder-<bookingId>-<userId>") para
  // poder deduplicar -- sin esto, el poller de recordatorios de clase
  // (que corre cada pocos minutos) terminaría reenviando el mismo
  // recordatorio en cada corrida mientras la reserva siga "por venir".
  @Index()
  @Column({ nullable: true })
  reference_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
