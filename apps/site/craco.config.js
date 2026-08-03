const path = require('path');
const uiPath = path.resolve(__dirname, '../../packages/ui');
const tokensPath = path.resolve(__dirname, '../../packages/tokens');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // 1) Allow imports outside src/ (remove CRA's ModuleScopePlugin)
      if (webpackConfig.resolve && Array.isArray(webpackConfig.resolve.plugins)) {
        webpackConfig.resolve.plugins = webpackConfig.resolve.plugins.filter(
          (p) => !(p && p.constructor && p.constructor.name === 'ModuleScopePlugin')
        );
      }

      // 2) Make Babel transpile our linked workspace packages (JSX in packages/ui, etc.)
      const oneOf = webpackConfig.module.rules.find((r) => Array.isArray(r.oneOf))?.oneOf || [];
      const babelRule = oneOf.find(
        (r) => r.loader && r.loader.includes('babel-loader') && r.include
      );
      if (babelRule) {
        if (Array.isArray(babelRule.include)) {
          babelRule.include.push(uiPath, tokensPath);
        } else {
          babelRule.include = [babelRule.include, uiPath, tokensPath];
        }
      }

      // Optional: ensure HMR picks up changes in linked packages
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.symlinks = true;

      return webpackConfig;
    },
  },
};
