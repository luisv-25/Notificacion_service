import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingServiceClient } from "../clients/booking-service.client";
import { CatalogServiceClient } from "../clients/catalog-service.client";

const POLL_INTERVAL_MS = Number(process.env.REMINDER_POLL_INTERVAL_MS) || 5 * 60_000; // 5 min
const REMINDER_WINDOW_MINUTES = Number(process.env.REMINDER_WINDOW_MINUTES) || 60; // 1h antes

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
    const bookings = await this.bookingServiceClient.findAllBookings();
    const now = Date.now();
    const windowEnd = now + REMINDER_WINDOW_MINUTES * 60_000;

    const upcoming = bookings.filter((b) => {
      if (b.status !== "confirmed") return false;
      const scheduledAtMs = new Date(b.scheduled_at).getTime();
      return scheduledAtMs > now && scheduledAtMs <= windowEnd;
    });

    if (upcoming.length === 0) return;
    this.logger.log(`${upcoming.length} reserva(s) por comenzar dentro de ${REMINDER_WINDOW_MINUTES} min`);

    for (const booking of upcoming) {
      const data = { bookingId: booking.id, scheduledAt: booking.scheduled_at };

      await this.notificationsService.notifyUser(
        booking.student_id,
        "class_reminder",
        data,
        `class_reminder-${booking.id}-${booking.student_id}`,
      );

      try {
        const tutorProfile = await this.catalogServiceClient.getTutorProfile(booking.tutor_id);
        const tutorUserId = tutorProfile?.user?.id;
        if (tutorUserId) {
          await this.notificationsService.notifyUser(
            tutorUserId,
            "class_reminder",
            data,
            `class_reminder-${booking.id}-${tutorUserId}`,
          );
        }
      } catch (err) {
        this.logger.error(`No se pudo resolver el tutor de la reserva ${booking.id}: ${(err as Error).message}`);
      }
    }
  }
}
