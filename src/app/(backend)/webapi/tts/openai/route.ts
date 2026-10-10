// Text-to-speech was retired on 2026/10/09. Desktop and CLI builds released
// before that still POST here, so they get a stable answer instead of a 404.
export const POST = async () =>
  Response.json(
    { error: 'Text-to-speech has been retired.', errorType: 'FeatureRetired' },
    { status: 410 },
  );
