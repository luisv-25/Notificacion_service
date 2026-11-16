import { NotificationsService } from "../../src/notifications/notifications.service";
import { NotificationStatus } from "../../src/notifications/entities/notification-log.entity";
import { RemindersScheduler } from "../../src/reminders/reminders.scheduler";

// Pruebas UNITARIAS: BD (repositorios), correo, User Service, Booking y Catalog se reemplazan por mocks.
describe("Notificaciones (unitarias, con mocks)", () => {
  describe("NotificationsService.notifyUser", () => {
    const logsRepo = { exist: jest.fn(), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    const preferencesRepo = { findOne: jest.fn() };
    const emailClient = { send: jest.fn() };
    const userClient = { getUser: jest.fn() };
    const service = new NotificationsService(logsRepo as any, preferencesRepo as any, emailClient as any, userClient as any);

    beforeEach(() => {
      jest.clearAllMocks();
      logsRepo.exist.mockResolvedValue(false);
      preferencesRepo.findOne.mockResolvedValue(null);
      userClient.getUser.mockResolvedValue({ email: "ana@correo.com" });
      emailClient.send.mockResolvedValue({ succeeded: true, isMock: true });
    });

    it("Unitaria 1: es idempotente por referenceId y respeta los canales silenciados por el usuario", async () => {
      // Ya existe un registro con ese referenceId: no se envía nada (reentrega de RabbitMQ)
      logsRepo.exist.mockResolvedValue(true);
      await service.notifyUser("u1", "booking_confirmation", {}, "ref-1");
      expect(logsRepo.save).not.toHaveBeenCalled();
      expect(emailClient.send).not.toHaveBeenCalled();

      // Primera vez, con el correo silenciado: solo queda el registro in_app
      logsRepo.exist.mockResolvedValue(false);
      preferencesRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.channel === "email" ? { enabled: false } : null,
      );
      await service.notifyUser("u1", "booking_confirmation", {}, "ref-2");
      expect(emailClient.send).not.toHaveBeenCalled();
      expect(logsRepo.save).toHaveBeenCalledTimes(1);
      expect(logsRepo.save.mock.calls[0][0]).toMatchObject({ channel: "in_app", status: NotificationStatus.SENT, reference_id: "ref-2" });
    });

    it("Unitaria 1b: sin preferencias envía por ambos canales; si falla el correo o no se resuelve el email, queda FAILED", async () => {
      await service.notifyUser("u1", "class_reminder", { a: 1 }, "ref-3");
      expect(emailClient.send).toHaveBeenCalledWith("ana@correo.com", "class_reminder", { a: 1 });
      expect(logsRepo.save.mock.calls.map((c) => [c[0].channel, c[0].status]).sort()).toEqual([
        ["email", "sent"],
        ["in_app", "sent"],
      ]);

      jest.clearAllMocks();
      emailClient.send.mockResolvedValue({ succeeded: false, isMock: false });
      await service.notifyUser("u1", "class_reminder", {}, "ref-4");
      expect(logsRepo.save.mock.calls.map((c) => c[0]).find((l) => l.channel === "email")).toMatchObject({ status: NotificationStatus.FAILED, sent_at: null });

      jest.clearAllMocks();
      userClient.getUser.mockRejectedValue(new Error("User Service caído"));
      await service.notifyUser("u1", "class_reminder", {}, "ref-5");
      expect(emailClient.send).not.toHaveBeenCalled();
      expect(logsRepo.save.mock.calls.map((c) => c[0]).find((l) => l.channel === "email")).toMatchObject({ status: NotificationStatus.FAILED });
    });
  });

  describe("RemindersScheduler.remindUpcomingClasses", () => {
    const notifications = { notifyUser: jest.fn() };
    const bookingClient = { findAllBookings: jest.fn() };
    const catalogClient = { getTutorProfile: jest.fn() };
    const scheduler = new RemindersScheduler(notifications as any, bookingClient as any, catalogClient as any);

    it("Unitaria 2: recuerda solo reservas confirmadas que empiezan dentro de la ventana (60 min) y avisa a estudiante y tutor", async () => {
      const enMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
      bookingClient.findAllBookings.mockResolvedValue([
        { id: "b-ok", status: "confirmed", scheduled_at: enMin(30), student_id: "est-1", tutor_id: "tp-1" },
        { id: "b-lejos", status: "confirmed", scheduled_at: enMin(180), student_id: "est-2", tutor_id: "tp-1" },
        { id: "b-pasada", status: "confirmed", scheduled_at: enMin(-10), student_id: "est-3", tutor_id: "tp-1" },
        { id: "b-cancelada", status: "cancelled", scheduled_at: enMin(20), student_id: "est-4", tutor_id: "tp-1" },
      ]);
      catalogClient.getTutorProfile.mockResolvedValue({ user: { id: "tutor-user-1" } });

      await scheduler.remindUpcomingClasses();

      const refs = notifications.notifyUser.mock.calls.map((c) => c[3]);
      expect(refs).toEqual(["class_reminder-b-ok-est-1", "class_reminder-b-ok-tutor-user-1"]);
      expect(notifications.notifyUser.mock.calls[0][1]).toBe("class_reminder");
    });
  });
});
