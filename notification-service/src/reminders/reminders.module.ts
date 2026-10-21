import { Module } from "@nestjs/common";
import { RemindersScheduler } from "./reminders.scheduler";
import { NotificationsModule } from "../notifications/notifications.module";
import { ClientsModule } from "../clients/clients.module";

@Module({
  imports: [NotificationsModule, ClientsModule],
  providers: [RemindersScheduler],
})
export class RemindersModule {}
