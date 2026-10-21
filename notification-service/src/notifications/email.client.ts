import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";

export interface EmailSendResult {
  succeeded: boolean;
  isMock: boolean;
}

// Contenido en español de cada plantilla (sección 5.8: "template" es un
// string libre, el documento no fija un catálogo cerrado).
const TEMPLATES: Record<string, (data: Record<string, unknown>) => { subject: string; html: string }> = {
  booking_confirmation: (data) => ({
    subject: "Tu tutoría fue confirmada — EduConecta",
    html: `<p>Tu tutoría del ${data.scheduledAt ?? ""} quedó confirmada. ¡Nos vemos ahí!</p>`,
  }),
  class_reminder: (data) => ({
    subject: "Tu clase empieza pronto — EduConecta",
    html: `<p>Recordatorio: tu tutoría comienza a las ${data.scheduledAt ?? ""}.</p>`,
  }),
  package_low_balance: (data) => ({
    subject: "Te quedan pocas horas en tu paquete — EduConecta",
    html: `<p>Te quedan ${data.hoursRemaining ?? "pocas"} hora(s) en tu paquete prepagado. Considera renovarlo para no quedarte sin cupo.</p>`,
  }),
};

// No hay proveedor de correo real configurado por defecto (Resend/SendGrid
// no son parte del alcance del curso). Mismo criterio que DailyClient /
// GatewayClient / StorageClient: si no hay RESEND_API_KEY, el envío se
// SIMULA como exitoso (se registra en notification_log igual que uno
// real) en vez de fallar o inventar una entrega que no ocurrió. Queda
// aislado aquí para conectar un proveedor real en un solo archivo.
@Injectable()
export class EmailClient {
  private readonly logger = new Logger(EmailClient.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly fromAddress = process.env.NOTIFICATIONS_FROM_EMAIL || "notificaciones@educonecta.demo";

  constructor(private readonly http: HttpService) {}

  async send(to: string, template: string, data: Record<string, unknown>): Promise<EmailSendResult> {
    const content = TEMPLATES[template] ?? {
      subject: "Notificación de EduConecta",
      html: `<p>${template}</p>`,
    };
    const rendered = typeof content === "function" ? content(data) : content;

    if (!this.apiKey) {
      this.logger.warn(`RESEND_API_KEY no configurada: correo SIMULADO a ${to} ("${rendered.subject}")`);
      return { succeeded: true, isMock: true };
    }

    try {
      await firstValueFrom(
        this.http.post(
          "https://api.resend.com/emails",
          { from: this.fromAddress, to, subject: rendered.subject, html: rendered.html },
          { headers: { Authorization: `Bearer ${this.apiKey}` }, timeout: 5000 },
        ),
      );
      return { succeeded: true, isMock: false };
    } catch (err) {
      const axiosErr = err as AxiosError;
      this.logger.error(`Fallo al enviar correo a ${to}: ${axiosErr.message}`);
      return { succeeded: false, isMock: false };
    }
  }
}
