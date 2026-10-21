import { Controller, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { NotificationsService } from "../notifications/notifications.service";

interface PackageLowBalanceEvent {
  eventName: string;
  occurredAt: string;
  data: { packageId: string; studentId: string; hoursRemaining: number; triggeredByBookingId: string };
}

@Controller()
export class PackageLowBalanceConsumer {
  private readonly logger = new Logger(PackageLowBalanceConsumer.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  // "Alertas de renovación de paquete de horas" (sección 5.8 del
  // documento). payment-service publica este evento cuando, al consumir
  // una hora de un paquete, el saldo restante queda en o por debajo del
  // umbral configurado (ver PACKAGE_LOW_BALANCE_THRESHOLD en payment-service).
  @EventPattern("package.low_balance")
  async handlePackageLowBalance(@Payload() event: PackageLowBalanceEvent, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const { packageId, studentId, hoursRemaining, triggeredByBookingId } = event.data;
      await this.notificationsService.notifyUser(
        studentId,
        "package_low_balance",
        { packageId, hoursRemaining },
        // Incluye el booking que disparó la alerta: así SÍ se puede
        // volver a avisar si el saldo vuelve a quedar bajo más adelante
        // (otra sesión, otro booking), pero nunca dos veces por el mismo
        // evento si RabbitMQ lo reentrega.
        `package_low_balance-${packageId}-${triggeredByBookingId}`,
      );
      channel.ack(originalMsg);
    } catch (err) {
      this.logger.error("Error procesando package.low_balance", err as Error);
      channel.nack(originalMsg, false, true);
    }
  }
}
