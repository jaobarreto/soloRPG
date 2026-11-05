import { Module } from '@nestjs/common';
import { gloamhaleModule, gloamhaleVersion } from './gloamhale-module';
import { gloamhaleV2 } from './definitions/v2/gloamhale-v2';
import { gloamhaleV3 } from './definitions/v3/gloamhale-v3';
import { gloamhaleV4 } from './definitions/v4/gloamhale-v4';
import { gloamhaleV5 } from './definitions/v5/gloamhale-v5';

export const GLOAMHALE_ADVENTURES = Symbol('GLOAMHALE_ADVENTURES');

@Module({
  providers: [
    {
      provide: GLOAMHALE_ADVENTURES,
      useValue: [
        gloamhaleModule,
        ...[gloamhaleV2, gloamhaleV3, gloamhaleV4, gloamhaleV5].map(
          gloamhaleVersion,
        ),
      ],
    },
  ],
  exports: [GLOAMHALE_ADVENTURES],
})
export class GloamhaleModule {}
