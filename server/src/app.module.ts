import { Module } from '@nestjs/common'
import { SightingsController } from './sightings.controller.js'
import { SightingsService } from './sightings.service.js'

// register the sightings controller and proxy service
@Module({ controllers: [SightingsController], providers: [SightingsService] })
export class AppModule {}
