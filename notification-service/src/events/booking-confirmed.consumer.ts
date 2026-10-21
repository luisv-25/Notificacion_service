import { Controller, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { NotificationsService } from "../notifications/notifications.service";
import { CatalogServiceClient } from "../clients/catalog-service.client";

interface BookingConfirmedEvent {
  eventName: string;
  occurredAt: string;
  data: {
    bookingId: string;
    studentId: string;
    tutorId: string; // tutor_profiles.id -- se resuelve a user.id abajo
    subjectId?: string;
    scheduledAt: string;
  };
}

@Controller()
export class BookingConfirmedConsumer {
  private readonly logger = new Logger(BookingConfirmedConsumer.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly catalogServiceClient: CatalogServiceClient,
  ) {}

  // "Confirmaciones de reserva" (sección 5.8 del documento): notifica al
  // estudiante Y al tutor cuando una reserva queda confirmada.
  @EventPattern("booking.confirmed")
  async handleBookingConfirmed(@Payload() event: BookingConfirmedEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const { bookingId, studentId, tutorId, scheduledAt } = event.data;
      const data = { bookingId, scheduledAt };

      await this.notificationsService.notifyUser(
        studentId,
        "booking_confirmation",
        data,
        `booking_confirmation-${bookingId}-${studentId}`,
      );

      const tutorProfile = await this.catalogServiceClient.getTutorProfile(tutorId);
      const tutorUserId = tutorProfile?.user?.id;
      if (tutorUserId) {
        await this.notificationsService.notifyUser(
          tutorUserId,
          "booking_confirmation",
          data,
          `booking_confirmation-${bookingId}-${tutorUserId}`,
        );
      }

      channel.ack(originalMsg);
    } catch (err) {
      this.logger.error("Error procesando booking.confirmed", err as Error);
      channel.nack(originalMsg, false, true);
    }
  }
}
