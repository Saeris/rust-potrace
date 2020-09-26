module.exports = {
  plugins: [require(`@babel/plugin-proposal-class-properties`)],
  presets: [
    require(`@babel/preset-typescript`),
    [
      require(`@babel/preset-env`),
      {
        targets: { node: 12 },
        modules: false,
        useBuiltIns: `usage`,
        corejs: 3,
        bugfixes: true
      }
    ]
  ],
  env: {
    test: {
      sourceMaps: `inline`,
      plugins: [require(`@babel/plugin-transform-runtime`)],
      presets: [
        [
          require(`@babel/preset-env`),
          {
            targets: { node: 12 },
            modules: `commonjs`,
            useBuiltIns: `usage`,
            corejs: 3,
            bugfixes: true
          }
        ]
      ]
    }
  }
}
