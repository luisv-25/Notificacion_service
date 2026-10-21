import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { NotificationLog } from "./entities/notification-log.entity";
import { Preference } from "./entities/preference.entity";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { EmailClient } from "./email.client";
import { ClientsModule } from "../clients/clients.module";
import { JwtConfigModule } from "../common/jwt-config.module";

@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog, Preference]), HttpModule, ClientsModule, JwtConfigModule],
  providers: [NotificationsService, EmailClient],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
