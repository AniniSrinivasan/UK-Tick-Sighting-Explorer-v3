var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
/** Compatibility proxy only. Next.js owns validation, data access and response shapes. */
let SightingsService = class SightingsService {
    async forward(path, query = {}, body) {
        const origin = process.env.NEXT_BACKEND_URL;
        if (!origin)
            throw new ServiceUnavailableException('Set NEXT_BACKEND_URL to the canonical Next.js server.');
        const url = new URL(`/api/${path}`, origin);
        for (const [key, value] of Object.entries(query))
            if (value !== undefined)
                url.searchParams.set(key, value);
        let response;
        let result;
        try {
            response = await fetch(url, {
                method: body === undefined ? 'GET' : 'POST',
                headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(25000),
            });
            result = await response.json();
        }
        catch {
            throw new ServiceUnavailableException('Canonical backend is unavailable.');
        }
        if (!response.ok)
            throw new HttpException(result, response.status);
        return result;
    }
    findAll(query) { return this.forward('sightings', query); }
    create(body) { return this.forward('sightings', {}, body ?? null); }
    insights(query) { return this.forward('insights', query); }
};
SightingsService = __decorate([
    Injectable()
], SightingsService);
export { SightingsService };
