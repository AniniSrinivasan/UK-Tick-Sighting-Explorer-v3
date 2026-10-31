import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { SightingsService } from './sightings.service.js'

// NestJS routes for sightings and insights
@Controller('sightings')
export class SightingsController {
  constructor(private readonly sightings: SightingsService) {}
  // forward sightings search requests
  @Get() findAll(@Query() query: Record<string, string | undefined>) { return this.sightings.findAll(query) }
  // forward new JSON reports
  @Post() create(@Body() body: Record<string, unknown>) { return this.sightings.create(body) }
  // forward reporting insights requests
  @Get('insights') insights(@Query() query: Record<string, string | undefined>) { return this.sightings.insights(query) }
}
