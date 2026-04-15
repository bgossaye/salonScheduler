const path = require('path');

module.exports = {
  webpack: {
    configure: (config) => {
      // Find CRA's babel-loader rule
      const oneOfRule = config.module.rules.find(r => Array.isArray(r.oneOf))?.oneOf || [];
      const babelRule = oneOfRule.find(
        r => r.loader && r.loader.includes('babel-loader') && r.include
      );

      if (babelRule) {
        babelRule.include = [
          babelRule.include,
          // add the UI package so JSX there also gets transpiled
          path.resolve(__dirname, '../../../packages/ui'),
        ];
      }
 const smRule = config.module.rules.find(
        r => r.enforce === 'pre' &&
             (r.use || []).some(u => String(u.loader || '').includes('source-map-loader'))
      );

 if (smRule) {
        const exclude = smRule.exclude ? [].concat(smRule.exclude) : [];
        exclude.push(/node_modules[\\/]html5-qrcode[\\/]esm/);
        smRule.exclude = exclude;
      }
      return config;
    },
  },
};
