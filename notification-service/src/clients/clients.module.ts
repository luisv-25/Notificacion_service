import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { UserServiceClient } from "./user-service.client";
import { CatalogServiceClient } from "./catalog-service.client";
import { BookingServiceClient } from "./booking-service.client";

// Agrupa los 3 clientes síncronos salientes que usa este servicio, para no
// repetir HttpModule + providers en cada módulo que los necesita
// (EventsModule y RemindersModule).
@Module({
  imports: [HttpModule],
  providers: [UserServiceClient, CatalogServiceClient, BookingServiceClient],
  exports: [UserServiceClient, CatalogServiceClient, BookingServiceClient],
})
export class ClientsModule {}
