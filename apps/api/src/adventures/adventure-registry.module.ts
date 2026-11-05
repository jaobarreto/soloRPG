import { Module } from '@nestjs/common';
import {
  AdventureRegistry,
  type AdventureModuleDefinition,
} from './core/registry/registry';
import {
  GLOAMHALE_ADVENTURES,
  GloamhaleModule,
} from './gloamhale/gloamhale.module';
import {
  currentAdventure,
  defaultAdventure,
} from './gloamhale/default-adventure';

@Module({
  imports: [GloamhaleModule],
  providers: [
    {
      provide: AdventureRegistry,
      inject: [GLOAMHALE_ADVENTURES],
      useFactory: (gloamhale: readonly AdventureModuleDefinition[]) =>
        new AdventureRegistry(gloamhale, {
          legacyImport: defaultAdventure,
          newCampaign: currentAdventure,
        }),
    },
  ],
  exports: [AdventureRegistry],
})
export class AdventureRegistryModule {}
