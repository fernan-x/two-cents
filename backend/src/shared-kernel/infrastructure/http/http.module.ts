import {
  Global,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { RequestContext, RequestContextMiddleware } from './request-context';

@Global()
@Module({
  providers: [RequestContext],
  exports: [RequestContext],
})
export class HttpContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
