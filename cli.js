#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const [ ,, ...args ] = process.argv;
const VERSION = require('./package.json').version;

const parseOptions = options => {
  const obj = {};
  options.forEach(opt => {
    const [key, value = true] = opt.split('=');
    obj[key.replace(/^\-+/, '').toLowerCase()] = value;
  })
  return obj;
}

const showHelp = () => {
    process.stdout.write(
        `@itdc/bundlewiz v${VERSION}\n` +
        '\n' +
        'Options:\n' +
        '  --version Show version number\n' +
        '  --help    Show this help\n' +
        '\n' +
        'Usage:\n' +
        '  bundlewiz webpack --mode=production\n'
      )
}

const showVersion = () => {
  process.stdout.write(`@itdc/bundlewiz v${VERSION}\n`);
}

const bundle = (BUNDLER = 'webpack', options = { mode: 'production' }) => {
  if (options.config) {
    const configPath = path.resolve('./', options.config);
    if (!fs.existsSync(configPath)) {
      console.log(`${chalk.red(`bundlewiz error`)} Config to use not found at: ${chalk.yellow(configPath)}`);
      process.exit(1);
    } else {
      let config = require(configPath);
      if (typeof config === 'function') {
        config = config(options);
      }
      require('./index').buildForConfig(config, BUNDLER);
    }
  } else {
    require('./index').buildForMode(options.mode, BUNDLER);
  }
}

if (!args.length || args[0] === '--help') {
    showHelp();
} else if (args[0] === '--version') {
    showVersion();
} else {
    const [BUNDLER, ...options] = args;
    bundle(BUNDLER, parseOptions(options));
}

