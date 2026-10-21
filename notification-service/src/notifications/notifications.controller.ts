import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { UpdatePreferenceDto } from "./dto/update-preference.dto";
import { JwtRolesGuard } from "../common/jwt-roles.guard";

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("notifications")
  @UseGuards(JwtRolesGuard)
  listForUser(@Query("userId") userId: string, @Req() req: any) {
    return this.notificationsService.listForUser(userId || req.user.id, req.user);
  }

  @Get("preferences/:userId")
  @UseGuards(JwtRolesGuard)
  getPreferences(@Param("userId") userId: string, @Req() req: any) {
    return this.notificationsService.getPreferences(userId, req.user);
  }

  @Put("preferences/:userId")
  @UseGuards(JwtRolesGuard)
  updatePreference(@Param("userId") userId: string, @Body() dto: UpdatePreferenceDto, @Req() req: any) {
    return this.notificationsService.upsertPreference(userId, req.user, dto.channel, dto.enabled);
  }
}
