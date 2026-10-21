import { IsBoolean, IsIn } from "class-validator";

export class UpdatePreferenceDto {
  @IsIn(["email", "in_app"])
  channel: string;

  @IsBoolean()
  enabled: boolean;
}
