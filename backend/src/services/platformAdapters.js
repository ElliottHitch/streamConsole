export const SUPPORTED_PLATFORMS = ["youtube", "facebook"];

export function createPlatformAdapters({ youtubeIntegrationService } = {}) {
  return {
    youtube: {
      async schedule(stream) {
        if (!youtubeIntegrationService) {
          throw new Error("YouTube integration service is not configured.");
        }

        return youtubeIntegrationService.scheduleStream(stream);
      }
    },
    facebook: {
      async schedule(stream) {
        if (stream.title.includes("[fail-facebook]")) {
          throw new Error("Facebook sync failed in stub adapter.");
        }

        return { externalId: `fb_${stream.id}` };
      }
    }
  };
}
