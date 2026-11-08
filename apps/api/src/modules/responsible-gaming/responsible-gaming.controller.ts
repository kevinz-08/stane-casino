import { Controller } from '@nestjs/common';
import { ResponsibleGamingService } from './responsible-gaming.service';

@Controller('responsible-gaming')
export class ResponsibleGamingController {
  constructor(private readonly responsibleGamingService: ResponsibleGamingService) {}

  // TODO(fase-5): endpoints
}
