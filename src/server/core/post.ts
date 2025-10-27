import { context, reddit } from '@devvit/web/server';

export const createPost = async () => {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is required');
  }

  return await reddit.submitCustomPost({
    splash: {
      // Splash Screen Configuration
      appDisplayName: 'Signal Stack',
      backgroundUri: 'signal-stack-splash.png',
      buttonLabel: 'Enter Dispatch Console',
      description: 'Coordinate trains with the community before the season ends.',
      entry: 'default',
      heading: 'Keep the network flowing',
      appIconUri: 'signal-stack-icon.png',
    },
    postData: {
      seasonId: 'preseason',
      totalDeliveries: 0,
    },
    subredditName: subredditName,
    title: 'Signal Stack Dispatch Console',
  });
};
