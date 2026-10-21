import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationLog, NotificationStatus } from "./entities/notification-log.entity";
import { Preference } from "./entities/preference.entity";
import { EmailClient } from "./email.client";
import { UserServiceClient } from "../clients/user-service.client";

export const CHANNELS = ["email", "in_app"] as const;
export type Channel = (typeof CHANNELS)[number];

interface Requester {
  id: string;
  role: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationLog) private readonly logsRepo: Repository<NotificationLog>,
    @InjectRepository(Preference) private readonly preferencesRepo: Repository<Preference>,
    private readonly emailClient: EmailClient,
    private readonly userServiceClient: UserServiceClient,
  ) {}

  // Punto de entrada único para todo el servicio (consumers de eventos y
  // el poller de recordatorios): envía por TODOS los canales soportados,
  // respetando las preferencias del usuario, y es idempotente por
  // referenceId -- si ya existe un registro con ese referenceId (de
  // cualquier canal), no reintenta nada. Esto es lo que evita que una
  // reentrega de RabbitMQ o una corrida repetida del poller de
  // recordatorios termine mandando el mismo aviso dos veces.
  async notifyUser(userId: string, template: string, data: Record<string, unknown>, referenceId: string) {
    const alreadySent = await this.logsRepo.exist({ where: { reference_id: referenceId } });
    if (alreadySent) {
      this.logger.log(`Ya se había notificado "${referenceId}"; se omite (idempotencia)`);
      return;
    }
    for (const channel of CHANNELS) {
      await this.notifyChannel(userId, channel, template, data, referenceId);
    }
  }

  private async notifyChannel(
    userId: string,
    channel: Channel,
    template: string,
    data: Record<string, unknown>,
    referenceId: string,
  ) {
    const preference = await this.preferencesRepo.findOne({ where: { user_id: userId, channel } });
    // Sin preferencia guardada = habilitado por defecto (modelo opt-out,
    // no opt-in: un usuario nuevo sigue recibiendo avisos hasta que los
    // desactive explícitamente).
    if (preference && !preference.enabled) return;

    if (channel === "in_app") {
      // El propio registro ES la entrega -- no hay "envío" que pueda
      // fallar (el frontend leería notification_log para mostrar su
      // bandeja de notificaciones).
      await this.logsRepo.save(
        this.logsRepo.create({
          user_id: userId,
          channel,
          template,
          status: NotificationStatus.SENT,
          sent_at: new Date(),
          reference_id: referenceId,
        }),
      );
      return;
    }

    // channel === "email"
    let recipientEmail: string | null = null;
    try {
      const user = await this.userServiceClient.getUser(userId);
      recipientEmail = user.email;
    } catch (err) {
      this.logger.error(`No se pudo resolver el email de ${userId} para notificarlo: ${(err as Error).message}`);
    }

    if (!recipientEmail) {
      await this.logsRepo.save(
        this.logsRepo.create({ user_id: userId, channel, template, status: NotificationStatus.FAILED, reference_id: referenceId }),
      );
      return;
    }

    const result = await this.emailClient.send(recipientEmail, template, data);
    await this.logsRepo.save(
      this.logsRepo.create({
        user_id: userId,
        channel,
        template,
        status: result.succeeded ? NotificationStatus.SENT : NotificationStatus.FAILED,
        sent_at: result.succeeded ? new Date() : null,
        reference_id: referenceId,
      }),
    );
  }

  private assertSelfOrAdmin(userId: string, requester: Requester) {
    if (requester.role !== "admin" && requester.id !== userId) {
      throw new ForbiddenException("No puedes ver notificaciones de otro usuario");
    }
  }

  // Bandeja de notificaciones del propio usuario (o de cualquiera, si es
  // admin) -- cubre tanto in_app (lo único que el usuario "ve" en la app)
  // como el historial de lo enviado por email.
  async listForUser(userId: string, requester: Requester) {
    this.assertSelfOrAdmin(userId, requester);
    return this.logsRepo.find({ where: { user_id: userId }, order: { created_at: "DESC" } });
  }

  // Devuelve las preferencias del usuario con los defaults rellenados
  // para los canales que todavía no tiene guardados explícitamente.
  async getPreferences(userId: string, requester: Requester) {
    this.assertSelfOrAdmin(userId, requester);
    const saved = await this.preferencesRepo.find({ where: { user_id: userId } });
    return CHANNELS.map((channel) => {
      const existing = saved.find((p) => p.channel === channel);
      return { channel, enabled: existing ? existing.enabled : true };
    });
  }

  async upsertPreference(userId: string, requester: Requester, channel: string, enabled: boolean) {
    this.assertSelfOrAdmin(userId, requester);
    const existing = await this.preferencesRepo.findOne({ where: { user_id: userId, channel } });
    if (existing) {
      existing.enabled = enabled;
      return this.preferencesRepo.save(existing);
    }
    return this.preferencesRepo.save(this.preferencesRepo.create({ user_id: userId, channel, enabled }));
  }
}
