import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './src/app.module.js'

// start the optional NestJS API proxy
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN || true })
  app.setGlobalPrefix('api')
  await app.listen(Number(process.env.API_PORT || 4000), '0.0.0.0')
}
void bootstrap()
