import { HttpService } from "@nestjs/axios";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";

@Injectable()
export class UserServiceClient {
  private readonly logger = new Logger(UserServiceClient.name);
  private readonly baseUrl = process.env.USER_SERVICE_URL || "http://localhost:3001";

  // Comunicación SÍNCRONA hacia User Service: resuelve el email real del
  // destinatario antes de enviar una notificación por el canal "email"
  // (sección 4.3 del documento de arquitectura).
  async getUser(userId: string) {
    const url = `${this.baseUrl}/api/v1/users/${userId}`;
    this.logger.log(`GET User Service: ${url}`);
    try {
      const { data } = await firstValueFrom(
        this.http.get(url, { timeout: 3000 }),
      );
      return data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 404) {
        throw new NotFoundException(`Usuario ${userId} no existe en User Service`);
      }
      this.logger.error(`Fallo al consultar User Service para ${userId}: ${axiosErr.message}`);
      throw err;
    }
  }

  constructor(private readonly http: HttpService) {
    this.logger.log(`USER_SERVICE_URL = "${this.baseUrl}"`);
  }
}
