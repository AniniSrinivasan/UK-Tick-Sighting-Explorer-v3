import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { SightingsService } from './sightings.service.js'

@Controller('sightings')
export class SightingsController {
  constructor(private readonly sightings: SightingsService) {}
  @Get() findAll(@Query() query: Record<string, string | undefined>) { return this.sightings.findAll(query) }
  @Post() create(@Body() body: Record<string, unknown>) { return this.sightings.create(body) }
  @Get('insights') insights(@Query() query: Record<string, string | undefined>) { return this.sightings.insights(query) }
}
