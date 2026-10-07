module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'babel-plugin-styled-components',
        {
          // Keep display names out of production bundles.
          displayName: process.env.NODE_ENV !== 'production',
          pure: true,
        },
      ],
    ],
  };
};
