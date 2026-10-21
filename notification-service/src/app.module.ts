import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { NotificationsModule } from "./notifications/notifications.module";
import { EventsModule } from "./events/events.module";
import { RemindersModule } from "./reminders/reminders.module";
import { NotificationLog } from "./notifications/entities/notification-log.entity";
import { Preference } from "./notifications/entities/preference.entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // habilita @Interval en RemindersScheduler
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5440,
      username: process.env.DB_USER || "notification_svc",
      password: process.env.DB_PASSWORD || "notification_svc_pw",
      database: process.env.DB_NAME || "notification_db",
      // Mismo apagador que el resto de los servicios para el despliegue en
      // Neon: se corre el DDL a mano y se despliega con
      // DB_SYNCHRONIZE=false.
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      entities: [NotificationLog, Preference],
      synchronize: process.env.DB_SYNCHRONIZE !== "false",
    }),
    NotificationsModule,
    EventsModule,
    RemindersModule,
  ],
})
export class AppModule {}
