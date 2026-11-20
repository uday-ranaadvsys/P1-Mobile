// Metro (the app bundler) reads the web project's shared rules straight from the P1 folder: one set of
// rules for web, server and app. In code: import { ... } from 'floman-shared/constants'.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const shared = path.resolve(__dirname, '../P1/TENANTS/shared');
const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), 'floman-shared': shared };

module.exports = config;
