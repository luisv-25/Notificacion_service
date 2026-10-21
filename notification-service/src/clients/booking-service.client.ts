import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";

@Injectable()
export class BookingServiceClient {
  private readonly logger = new Logger(BookingServiceClient.name);
  private readonly baseUrl = process.env.BOOKING_SERVICE_URL || "http://localhost:3003";

  // Comunicación SÍNCRONA hacia Booking Service: el poller de recordatorios
  // de clase (sección 5.8, "recordatorios de clase próxima") necesita
  // saber qué reservas confirmadas están por empezar. No hace falta un
  // endpoint nuevo: GET /bookings sin filtros ya devuelve todas, y acá se
  // filtra en memoria por status/scheduled_at -- Notification queda sin
  // tocar booking-service, consistente con el diseño "desacoplado por
  // diseño" que pide el documento para este servicio.
  async findAllBookings() {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.baseUrl}/api/v1/bookings`, { timeout: 5000 }),
      );
      return data as Array<{
        id: string;
        student_id: string;
        tutor_id: string;
        status: string;
        scheduled_at: string;
      }>;
    } catch (err) {
      const axiosErr = err as AxiosError;
      this.logger.error(`Fallo al consultar Booking Service: ${axiosErr.message}`);
      return [];
    }
  }

  constructor(private readonly http: HttpService) {}
}
