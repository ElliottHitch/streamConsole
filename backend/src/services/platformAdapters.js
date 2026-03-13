export const SUPPORTED_PLATFORMS = ["youtube", "facebook"];

export function createPlatformAdapters() {
  return {
    youtube: {
      async schedule(stream) {
        return { status: "stubbed", platform: "youtube", streamId: stream.id };
      }
    },
    facebook: {
      async schedule(stream) {
        return { status: "stubbed", platform: "facebook", streamId: stream.id };
      }
    }
  };
}