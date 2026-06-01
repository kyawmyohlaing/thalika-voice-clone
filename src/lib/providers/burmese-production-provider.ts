import type { TTSProvider } from "./base";
import { voxcpm2Provider } from "./voxcpm2-provider";

export const burmeseProductionProvider: TTSProvider = {
  id: "burmese_production",
  name: "Burmese Production",
  async generate(input) {
    const result = await voxcpm2Provider.generate(input);
    return {
      ...result,
      metadata: {
        ...result.metadata,
        productionTrack: "burmese",
        engine: "voxcpm2"
      }
    };
  }
};
