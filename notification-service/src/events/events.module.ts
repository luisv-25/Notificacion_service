import { Module } from "@nestjs/common";
import { BookingConfirmedConsumer } from "./booking-confirmed.consumer";
import { PackageLowBalanceConsumer } from "./package-low-balance.consumer";
import { NotificationsModule } from "../notifications/notifications.module";
import { ClientsModule } from "../clients/clients.module";

// A diferencia de payment-service/content-service, Notification no
// publica eventos propios (es un consumidor terminal), así que no hay
// dependencia circular con NotificationsModule -- no hace falta forwardRef.
@Module({
  imports: [NotificationsModule, ClientsModule],
  controllers: [BookingConfirmedConsumer, PackageLowBalanceConsumer],
})
export class EventsModule {}
