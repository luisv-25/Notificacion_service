
import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingServiceClient } from "../clients/booking-service.client";
import { CatalogServiceClient } from "../clients/catalog-service.client";

const POLL_INTERVAL_MS =
  Number(process.env.REMINDER_POLL_INTERVAL_MS) || 5 * 60_000;

const REMINDER_WINDOW_MINUTES =
  Number(process.env.REMINDER_WINDOW_MINUTES) || 60;

// "Recordatorios de clase próxima" (sección 5.8 del documento). A
// diferencia de las otras dos notificaciones (que reaccionan a un evento
// de otro servicio), esta es inherentemente temporal -- nadie publica un
// evento "faltan 60 minutos". Por eso Notification hace polling periódico
// sobre Booking Service en vez de quedar esperando un evento que no
// existe; ningún otro microservicio de este proyecto tiene infraestructura
// de jobs programados, así que esta es la primera y se mantiene simple
// (un @Interval, sin cola ni librería de cron externa).

@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly bookingServiceClient: BookingServiceClient,
    private readonly catalogServiceClient: CatalogServiceClient,
  ) {}

  @Interval(POLL_INTERVAL_MS)
  async remindUpcomingClasses() {
    const bookings =
      await this.bookingServiceClient.findAllBookings();

    const now = Date.now();

    for (const booking of bookings) {
      if (booking.status !== "confirmed") continue;

      const scheduledAtMs =
        new Date(booking.scheduled_at).getTime();

      if (!Number.isFinite(scheduledAtMs)) continue;

      const minutesUntil =
        (scheduledAtMs - now) / 60_000;

      // Recordatorio 24 horas antes.
      // Margen de 15 minutos para tolerar retrasos del polling.
      if (
        minutesUntil <= 1440 &&
        minutesUntil > 1425
      ) {
        await this.sendReminder(booking, "24h");
      }

      // Conserva el recordatorio existente de 1 hora.
      if (
        minutesUntil > 0 &&
        minutesUntil <= REMINDER_WINDOW_MINUTES
      ) {
        await this.sendReminder(booking, "1h");
      }
    }
  }

  private async sendReminder(
    booking: {
      id: string;
      student_id: string;
      tutor_id: string;
      scheduled_at: string;
    },
    reminderType: "24h" | "1h",
  ) {
    const data = {
      bookingId: booking.id,
      scheduledAt: booking.scheduled_at,
      reminderType,
    };

    this.logger.log(
      `Recordatorio ${reminderType} para reserva ${booking.id}`,
    );

    await this.notificationsService.notifyUser(
      booking.student_id,
      "class_reminder",
      data,
      `class_reminder-${reminderType}-${booking.id}-${booking.student_id}`,
    );

    try {
      const tutorProfile =
        await this.catalogServiceClient.getTutorProfile(
          booking.tutor_id,
        );

      const tutorUserId = tutorProfile?.user?.id;

      if (tutorUserId) {
        await this.notificationsService.notifyUser(
          tutorUserId,
          "class_reminder",
          data,
          `class_reminder-${reminderType}-${booking.id}-${tutorUserId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Error notificando al tutor: ${(err as Error).message}`,
      );
    }
  }
}
