module.exports = {
  displayName: `rust-potrace`,
  coverageDirectory: `./.coverage/`,
  collectCoverage: true,
  collectCoverageFrom: [
    // include
    `./src/**/*.ts`,
    // exclude
    `!**/__MOCKS__/**/*`,
    `!**/__TEST__/**/*`,
    `!**/node_modules/**`,
    `!**/vendor/**`
  ],
  transform: {
    "^.+\\.ts$": `babel-jest`
  }
}
