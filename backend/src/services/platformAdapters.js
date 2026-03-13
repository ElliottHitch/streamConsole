export const SUPPORTED_PLATFORMS = ["youtube", "facebook"];

export function createPlatformAdapters() {
  return {
    youtube: {
      async schedule(stream) {
        if (stream.title.includes("[fail-youtube]")) {
          throw new Error("YouTube sync failed in stub adapter.");
        }

        return { externalId: `yt_${stream.id}` };
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
