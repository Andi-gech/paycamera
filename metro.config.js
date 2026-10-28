const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Cheerio's full Node entry point imports node:stream (which React Native does not provide).
// Alias 'cheerio' to 'cheerio/slim' which uses pure JS htmlparser2 without Node builtins.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'cheerio') {
    return context.resolveRequest(context, 'cheerio/slim', platform);
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

