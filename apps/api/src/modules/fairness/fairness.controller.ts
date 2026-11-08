import { Controller } from '@nestjs/common';
import { FairnessService } from './fairness.service';

@Controller('fairness')
export class FairnessController {
  constructor(private readonly fairnessService: FairnessService) {}

  // TODO(fase-2): endpoints
}
