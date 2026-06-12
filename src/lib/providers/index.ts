import type { VoiceProvider } from "../types";
import type { TTSProvider } from "./base";
import { burmeseProductionProvider } from "./burmese-production-provider";
import { voxcpm2Provider } from "./voxcpm2-provider";
import { voxcpm2LocalProvider } from "./voxcpm2-local-provider";

const providers: Record<VoiceProvider, TTSProvider> = {
  voxcpm2: voxcpm2Provider,
  voxcpm2_local: voxcpm2LocalProvider,
  burmese_production: burmeseProductionProvider
};

export function getProvider(id: VoiceProvider) {
  return providers[id];
}

export const providerList = Object.values(providers);
