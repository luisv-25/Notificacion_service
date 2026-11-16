import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { EmailClient } from "../../src/notifications/email.client";
import { UserServiceClient } from "../../src/clients/user-service.client";
import { CatalogServiceClient } from "../../src/clients/catalog-service.client";
import { BookingServiceClient } from "../../src/clients/booking-service.client";
import { BookingConfirmedConsumer } from "../../src/events/booking-confirmed.consumer";
import { PackageLowBalanceConsumer } from "../../src/events/package-low-balance.consumer";
import { createTestApp, tokenFor } from "../helpers/test-app";

const ESTUDIANTE = "11111111-1111-4111-8111-111111111111";
const TUTOR_USER = "22222222-2222-4222-8222-222222222222";
const OTRO = "33333333-3333-4333-8333-333333333333";

// Prueba de INTEGRACIÓN: eventos -> servicio -> PostgreSQL real, y endpoints HTTP con JWT.
// Se reemplazan el correo (sin red) y los clientes HTTP a otros microservicios.
describe("Integración: notificaciones por eventos, preferencias y bandeja", () => {
  let app: INestApplication;
  const correos: any[] = [];
  const emailFake = { send: jest.fn(async (to: string, template: string) => (correos.push({ to, template }), { succeeded: true, isMock: true })) };
  const userFake = { getUser: jest.fn(async (id: string) => ({ id, email: `${id.slice(0, 4)}@educonecta.test` })) };
  const catalogFake = { getTutorProfile: jest.fn(async () => ({ user: { id: TUTOR_USER } })) };
  const bookingFake = { findAllBookings: jest.fn(async () => []) };
  const ctx = { getChannelRef: () => ({ ack: jest.fn(), nack: jest.fn() }), getMessage: () => ({}) } as any;

  beforeAll(async () => {
    app = await createTestApp(
      [AppModule],
      [
        { provide: EmailClient, useValue: emailFake },
        { provide: UserServiceClient, useValue: userFake },
        { provide: CatalogServiceClient, useValue: catalogFake },
        { provide: BookingServiceClient, useValue: bookingFake },
      ],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("crea notificaciones desde eventos, respeta preferencias, no duplica y protege la bandeja por rol", async () => {
    const http = request(app.getHttpServer());
    const auth = (id: string, role: "student" | "tutor" | "admin") => ({ Authorization: `Bearer ${tokenFor(id, role)}` });
    const reserva = {
      eventName: "booking.confirmed",
      occurredAt: new Date().toISOString(),
      data: { bookingId: "bk-1", studentId: ESTUDIANTE, tutorId: "tp-1", scheduledAt: "2030-01-01T10:00:00Z" },
    };

    // EVENTO booking.confirmed: notifica al estudiante y al tutor (email + in_app cada uno)
    await app.get(BookingConfirmedConsumer).handleBookingConfirmed(reserva as any, ctx);
    expect(correos.map((c) => c.template)).toEqual(["booking_confirmation", "booking_confirmation"]);

    let bandeja = await http.get("/api/v1/notifications").set(auth(ESTUDIANTE, "student")).expect(200);
    expect(bandeja.body.map((n: any) => n.channel).sort()).toEqual(["email", "in_app"]);
    expect(bandeja.body.every((n: any) => n.status === "sent" && n.sent_at)).toBe(true);

    // IDEMPOTENCIA: reentrega del mismo evento no crea registros ni correos nuevos
    await app.get(BookingConfirmedConsumer).handleBookingConfirmed(reserva as any, ctx);
    expect(correos).toHaveLength(2);
    bandeja = await http.get("/api/v1/notifications").set(auth(ESTUDIANTE, "student")).expect(200);
    expect(bandeja.body).toHaveLength(2);

    // PREFERENCIAS: por defecto todo habilitado; se silencia email y se valida el DTO
    const prefs0 = await http.get(`/api/v1/preferences/${ESTUDIANTE}`).set(auth(ESTUDIANTE, "student")).expect(200);
    expect(prefs0.body).toEqual([{ channel: "email", enabled: true }, { channel: "in_app", enabled: true }]);
    await http.put(`/api/v1/preferences/${ESTUDIANTE}`).set(auth(ESTUDIANTE, "student")).send({ channel: "sms", enabled: false }).expect(400);
    await http.put(`/api/v1/preferences/${ESTUDIANTE}`).set(auth(ESTUDIANTE, "student")).send({ channel: "email", enabled: false }).expect(200);
    await http.put(`/api/v1/preferences/${ESTUDIANTE}`).set(auth(ESTUDIANTE, "student")).send({ channel: "email", enabled: false }).expect(200); // upsert, no duplica
    const prefs1 = await http.get(`/api/v1/preferences/${ESTUDIANTE}`).set(auth(ESTUDIANTE, "student")).expect(200);
    expect(prefs1.body.find((p: any) => p.channel === "email").enabled).toBe(false);

    // EVENTO package.low_balance con email silenciado: solo se crea la notificación in_app
    await app.get(PackageLowBalanceConsumer).handlePackageLowBalance(
      {
        eventName: "package.low_balance",
        occurredAt: new Date().toISOString(),
        data: { packageId: "pk-1", studentId: ESTUDIANTE, hoursRemaining: 1, triggeredByBookingId: "bk-9" },
      } as any,
      ctx,
    );
    expect(correos).toHaveLength(2); // no salió correo nuevo
    bandeja = await http.get("/api/v1/notifications").set(auth(ESTUDIANTE, "student")).expect(200);
    const bajoSaldo = bandeja.body.filter((n: any) => n.template === "package_low_balance");
    expect(bajoSaldo).toHaveLength(1);
    expect(bajoSaldo[0]).toMatchObject({ channel: "in_app", reference_id: "package_low_balance-pk-1-bk-9" });

    // AUTORIZACIÓN: sin token 401; otro usuario 403; admin puede ver y consultar por userId
    await http.get("/api/v1/notifications").expect(401);
    await http.get(`/api/v1/notifications?userId=${ESTUDIANTE}`).set(auth(OTRO, "student")).expect(403);
    await http.get(`/api/v1/preferences/${ESTUDIANTE}`).set(auth(OTRO, "tutor")).expect(403);
    const comoAdmin = await http.get(`/api/v1/notifications?userId=${ESTUDIANTE}`).set(auth("admin-1", "admin")).expect(200);
    expect(comoAdmin.body).toHaveLength(3);
    const delTutor = await http.get("/api/v1/notifications").set(auth(TUTOR_USER, "tutor")).expect(200);
    expect(delTutor.body).toHaveLength(2);
  });
});
