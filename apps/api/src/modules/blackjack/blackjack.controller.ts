import { Controller } from '@nestjs/common';
import { BlackjackService } from './blackjack.service';

@Controller('blackjack')
export class BlackjackController {
  constructor(private readonly blackjackService: BlackjackService) {}

  // TODO(fase-2): endpoints
}
