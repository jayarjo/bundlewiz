/* eslint-disable no-undef */
const { getEnv } = require('./utils')

describe('utils', () => {
  test('getEnv()', () => {
    expect(getEnv()).toEqual(
      expect.objectContaining({
        APP_NAME: 'bundlewiz',
        APP_VERSION: '0.0.9',
        BRANCH: 'master'
      })
    )
  })
})
